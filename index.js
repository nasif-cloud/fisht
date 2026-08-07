require('dotenv').config();
// Ensure a Web Crypto `crypto` is available for libraries (mongodb uses it).
if (typeof globalThis.crypto === 'undefined') {
  try {
    // Prefer Node's WebCrypto if available
    const { webcrypto } = require('crypto');
    if (webcrypto) globalThis.crypto = webcrypto;
  } catch (e) {
    // Fallback: provide minimal getRandomValues using randomBytes
    const { randomBytes } = require('crypto');
    globalThis.crypto = {
      getRandomValues: (array) => {
        const buffer = randomBytes(array.length);
        array.set(buffer);
        return array;
      },
    };
  }
}
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const path = require('path');
const fs   = require('fs');

// The User model — needed so we can register new accounts automatically
const User = require('./models/user');

// The notification scheduler — sends DMs to opted-in players when
// their pull windows and daily reward reset. Started after login.
const { startNotifier } = require('./utils/notifier');

// CommandLock — prevents duplicate command handling when two bot instances
// are running at the same time. See models/commandLock.js for how it works.
const CommandLock = require('./models/commandLock');

// ServiceLease — keeps only one bot service actively handling commands.
// A newer service can take over from an older one immediately, and older
// services stop responding once they notice they no longer own the lease.
const ServiceLease = require('./models/serviceLease');

// Maintenance mode state — shared with the 'down' / 'downall' owner commands.
// maintenance.active → non-owners blocked; owner still works.
// maintenance.full   → everyone blocked including owner (except down/downall).
// Importing the same module object means all files see the same flags in memory.
const maintenance = require('./data/maintenance');
const { getCommandRestriction } = require('./utils/channelRestrictions');
const {
  handleDropInteraction,
  recordChannelActivity,
  startCardDropScheduler
} = require('./utils/cardDrops');

// The bot owner's Discord user ID — used to allow owner through normal maintenance.
const OWNER_ID = '1257718161298690119';

// ─────────────────────────────────────────────
// GLOBAL COMMAND COOLDOWN
// ─────────────────────────────────────────────
// Prevents any user from spamming the same command back-to-back.
// Entries are keyed as `${userId}:${commandName}` and store the last-used timestamp.
// Lives in memory only — resets if the bot restarts (that's fine for a 2-second guard).
const GLOBAL_COOLDOWN_MS = 2000; // 2 seconds between repeated uses of the same command
const globalCooldowns    = new Map();

const SERVICE_LEASE_ID = 'fisht-command-handler';
// A five-second heartbeat is enough to prevent duplicate bot instances while
// avoiding a MongoDB write every second on a small Replit deployment.
const SERVICE_LEASE_HEARTBEAT_MS = 5000;
const SERVICE_LEASE_STALE_MS = 20000;
const SERVICE_INSTANCE_ID = randomUUID();
const SERVICE_STARTED_AT = new Date();
let leaseHeartbeatTimer = null;
let serviceLeaseOwned = false;

// Shared leadership flag used by command collectors so a stale (older) deploy
// stops responding to buttons/dropdowns, preventing double-ack errors.
const { setLeadership } = require('./utils/leadership');

// ─────────────────────────────────────────────
// ACCOUNT REGISTRATION
// ─────────────────────────────────────────────
// This function runs before every command.
// If a user has never used the bot before, it:
//   1. Creates their save file in MongoDB
//   2. Gives them starter Berries and Meat
//   3. Sends them a welcome DM
// The "accountCreated" flag ensures this only ever happens once per user.

const STARTER_BERRIES = 2500;
const STARTER_MEAT    = 5;

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Web server is listening on port ${PORT}`);
});

async function registerAccount(discordUser) {
  try {
    // Look for an existing save file for this user
    let userData = await User.findOne({ userId: discordUser.id });
    const isNewAccount = !userData;
    let accountChanged = isNewAccount;

    // If no save file exists yet, create one (brand new player)
    if (isNewAccount) {
      userData = new User({ userId: discordUser.id });
    }
    if (userData.dmLevelUp == null) {
      userData.dmLevelUp = false;
      accountChanged = true;
    }

    // If the account hasn't been set up yet, give starter rewards
    if (!userData.accountCreated) {
      userData.balance        += STARTER_BERRIES; // Give starting Berries
      userData.meat           += STARTER_MEAT;    // Give starting Meat
      userData.accountCreated  = true;            // Mark as done so this never runs again
      accountChanged = true;
    }

    if (accountChanged) {
      await userData.save();

      // Try to DM the player a welcome message.
      // If their DMs are closed, we silently skip — the bot shouldn't crash over this.
      if (isNewAccount) {
        try {
          await discordUser.send(
            'Your account has been created. You received:\n' +
            `<:SilverCoin:1534757841867374782> **${STARTER_BERRIES.toLocaleString('en-US')}** Berries\n` +
            `<:Ham:1534995152605548585> **${STARTER_MEAT}** Meat`
          );
        } catch {
          // DMs are disabled for this user — skip silently
        }
      }
    }
  } catch (err) {
    // If something unexpected goes wrong during registration, log it but
    // don't let it stop the command from running.
    console.error('[registerAccount] Error:', err);
  }
}

async function claimServiceLease() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SERVICE_LEASE_STALE_MS);

  const claimFilter = {
    _id: SERVICE_LEASE_ID,
    $or: [
      { leaderId: SERVICE_INSTANCE_ID },
      { heartbeatAt: { $lt: staleBefore } },
      { startedAt: { $lt: SERVICE_STARTED_AT } },
      { startedAt: SERVICE_STARTED_AT, instanceId: { $lt: SERVICE_INSTANCE_ID } },
    ],
  };

  const claimUpdate = {
    $set: {
      leaderId: SERVICE_INSTANCE_ID,
      instanceId: SERVICE_INSTANCE_ID,
      startedAt: SERVICE_STARTED_AT,
      heartbeatAt: now,
      updatedAt: now,
    },
    $setOnInsert: {
      _id: SERVICE_LEASE_ID,
    },
  };

  const updateResult = await ServiceLease.updateOne(claimFilter, claimUpdate);
  if (updateResult.matchedCount > 0) {
    return true;
  }

  try {
    await ServiceLease.create({
      _id: SERVICE_LEASE_ID,
      leaderId: SERVICE_INSTANCE_ID,
      instanceId: SERVICE_INSTANCE_ID,
      startedAt: SERVICE_STARTED_AT,
      heartbeatAt: now,
      updatedAt: now,
    });
    return true;
  } catch (error) {
    if (error.code === 11000) {
      const retryResult = await ServiceLease.updateOne(claimFilter, claimUpdate);
      return retryResult.matchedCount > 0;
    }

    throw error;
  }
}

async function hasServiceLease() {
  const lease = await ServiceLease.findById(SERVICE_LEASE_ID).lean();
  return Boolean(
    lease &&
    lease.leaderId === SERVICE_INSTANCE_ID &&
    lease.instanceId === SERVICE_INSTANCE_ID
  );
}

async function maintainServiceLease() {
  try {
    if (leaseHeartbeatTimer) {
      clearInterval(leaseHeartbeatTimer);
    }

    leaseHeartbeatTimer = setInterval(async () => {
      try {
        const ownsLease = await claimServiceLease();
        if (ownsLease && !serviceLeaseOwned) {
          console.log('[ServiceLease] Gained leadership');
        }

        if (!ownsLease && serviceLeaseOwned) {
          console.warn('[ServiceLease] Lost leadership, pausing command handling');
        }

        serviceLeaseOwned = ownsLease;
        // Sync the shared flag so command collectors know whether this instance
        // is still the newest/main deploy.
        setLeadership(ownsLease);
      } catch (error) {
        console.error('[ServiceLease] Heartbeat error:', error.message);
      }
    }, SERVICE_LEASE_HEARTBEAT_MS);

    leaseHeartbeatTimer.unref?.();

    serviceLeaseOwned = await claimServiceLease();
    setLeadership(serviceLeaseOwned);
    if (serviceLeaseOwned) {
      console.log('[ServiceLease] Gained leadership');
    }
  } catch (error) {
    console.error('[ServiceLease] Failed to claim lease:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────
// DISCORD CLIENT SETUP
// ─────────────────────────────────────────────
// Intents tell Discord which events the bot wants to receive.
// Guilds + GuildMessages + MessageContent are needed for prefix commands.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// A Collection is like a Map — it stores all loaded commands by name
// so we can look them up quickly when someone runs a command.
client.commands = new Collection();

// ─────────────────────────────────────────────
// BOT STARTUP
// ─────────────────────────────────────────────
// We connect to MongoDB BEFORE logging into Discord so the database is
// always ready before any commands can arrive.
async function startBot() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Successfully connected to MongoDB Atlas!');

    // Older profiles may not have this preference field. Preserve explicit
    // DM choices, while making chat delivery the default for missing values.
    await User.updateMany(
      { $or: [{ dmLevelUp: { $exists: false } }, { dmLevelUp: null }] },
      { $set: { dmLevelUp: false } }
    );

    // Restore maintenance flags from the last saved state so a bot restart
    // doesn't silently clear a maintenance window the owner had set
    await maintenance.load();

    await maintainServiceLease();

    console.log('Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1); // Exit the process so the error is obvious in the logs
  }
}

// ─────────────────────────────────────────────
// EVENT: BOT READY
// ─────────────────────────────────────────────
client.once('ready', () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);

  // Start the background DM notifier now that the Discord client is live
  // and can fetch users and send messages
  startNotifier(client);
  startCardDropScheduler(client);
});

// ─────────────────────────────────────────────
// CLIENT ERROR HANDLER
// ─────────────────────────────────────────────
// Without this, any unhandled Discord API error (like error 10062 "Unknown
// interaction" — which happens when Discord tries to reply to an interaction
// that already timed out or was handled by another bot instance) will crash
// the entire Node.js process. This handler catches those errors and logs them
// instead of crashing, keeping the bot alive.
client.on('error', (error) => {
  console.error('[Discord Client Error]', error.message);
});

// ─────────────────────────────────────────────
// EVENT: SLASH COMMANDS
// ─────────────────────────────────────────────
// This fires every time someone uses a / command in Discord.
client.on('interactionCreate', async interaction => {
  // Autocomplete interactions only need a short list of suggestions.
  // Handle them before the normal slash-command path, which expects a
  // command execution and would otherwise ignore these interactions.
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return interaction.respond([]);

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(`[Autocomplete] ${interaction.commandName} failed:`, error.message);
      try {
        await interaction.respond([]);
      } catch {
        // The autocomplete interaction may already have expired.
      }
    }
    return;
  }

  // Card drop buttons are handled globally because their messages can outlive
  // the command execution that created them.
  if (
    interaction.isButton?.() &&
    (
      interaction.customId.startsWith('card_drop_claim:') ||
      interaction.customId.startsWith('card_drop_charge:')
    )
  ) {
    if (!(await hasServiceLease())) return;
    try {
      await handleDropInteraction(interaction);
    } catch (error) {
      console.error('[CardDrops] Button interaction failed:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'The card could not be claimed right now.',
            flags: 64
          });
        } else if (interaction.deferred && !interaction.replied) {
          await interaction.followUp({
            content: 'The card could not be claimed right now.',
            flags: 64
          });
        }
      } catch {
        // The interaction may have expired while the database was processing.
      }
    }
    return;
  }

  // Ignore anything else that isn't a slash command (e.g. other buttons,
  // dropdowns, and modals handled inside their command files).
  if (!interaction.isChatInputCommand()) return;

  // Only the current lease holder is allowed to process commands.
  // If a newer deployment took over, older services stop here.
  if (!(await hasServiceLease())) return;

  // ── MAINTENANCE MODE (slash) ──
  // full=true  → block everyone, no exceptions for slash commands
  // active=true → block non-owners only
  if (maintenance.full) {
    return interaction.reply({ content: 'Bot is in Maintenance, come back later', flags: 64 });
  }
  if (maintenance.active && interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: 'Bot is in Maintenance, come back later', flags: 64 });
  }

  // ── DEDUPLICATION LOCK ──
  // If two bot instances are running, both receive this event.
  // Only the first one to insert the lock document will process the command;
  // the other gets a duplicate-key error (11000) and returns silently.
  try {
    await CommandLock.create({ eventId: interaction.id });
  } catch (lockErr) {
    if (lockErr.code === 11000) return; // Another instance claimed this event first
    console.error('[CommandLock] Unexpected error:', lockErr.message);
    // Non-duplicate errors: log and continue rather than silently dropping the command
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  // Channel restrictions are checked centrally so they apply to every slash
  // command, including commands added later without extra command-file code.
  // The allow/disallow commands themselves always pass through so admins can
  // restore access to a restricted channel.
  if (!['allow', 'disallow'].includes(command.name)) {
    try {
      const restriction = await getCommandRestriction(
        interaction.guildId,
        interaction.channelId,
        command.name
      );
      if (restriction.blocked) {
        return interaction.reply({
          content: restriction.blockAll
            ? `This bots commands can't be used here`
            : `**${command.name}** can't be used here`,
          flags: 64
        });
      }
    } catch (restrictionError) {
      console.error('[ChannelRestriction] Slash check failed:', restrictionError.message);
    }
  }

  // ── GLOBAL COOLDOWN CHECK (slash) ──
  // Blocks the same user from spamming the same slash command within 2 seconds.
  // The cooldown key combines the user ID and command name so different commands
  // each get their own independent 2-second window per user.
  const slashCooldownKey = `${interaction.user.id}:${interaction.commandName}`;
  const slashLastUsed    = globalCooldowns.get(slashCooldownKey);
  const slashNow         = Date.now();
  if (slashLastUsed && (slashNow - slashLastUsed) < GLOBAL_COOLDOWN_MS) {
    const secsLeft = Math.ceil((GLOBAL_COOLDOWN_MS - (slashNow - slashLastUsed)) / 1000);
    const label    = secsLeft === 1 ? `second` : `seconds`;
    return interaction.reply({ content: `Wait **${secsLeft} ${label}** before using this command again`, flags: 64 });
  }
  globalCooldowns.set(slashCooldownKey, slashNow);

  try {
    // Register the account before running the command so the user always
    // has a save file by the time the command code runs.
    await registerAccount(interaction.user);

    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    // Error 10062 means the interaction already timed out or was handled elsewhere
    // (e.g. two bot instances running at the same time). Safe to skip — don't crash.
    if (error.code === 10062) return;

    // For all other errors, try to tell Discord we handled the interaction
    // so the command doesn't show a "failed" spinner in Discord.
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
      } else {
        await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
      }
    } catch {
      // If the error reply itself fails (e.g. interaction timed out), just ignore it
    }
  }
});

// ─────────────────────────────────────────────
// EVENT: PREFIX COMMANDS
// ─────────────────────────────────────────────
// This fires every time someone sends a message in a server.
client.on('messageCreate', async (message) => {
  // Ignore bots and DMs — prefix commands only work in servers
  if (message.author.bot || !message.guild) return;

  // Only the current lease holder is allowed to process commands.
  // If a newer deployment took over, older services stop here.
  if (!(await hasServiceLease())) return;

  // Track ordinary human conversation for enabled drop channels. This runs
  // before prefix parsing so command messages count as chat activity too.
  void recordChannelActivity(message);

  const prefix = 'op'; // The prefix the bot listens for

  // Check if the message starts with "op" (case-insensitive — "OP pull" also works)
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  // Split the message into individual words (args).
  // e.g. "op pull" → ['pull']   "op info luffy" → ['info', 'luffy']
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase(); // First word = command name

  // Look up the command in our loaded collection
  const command = client.commands.get(commandName);
  if (!command) return; // Unrecognised command — do nothing

  // ── DEDUPLICATION LOCK ──
  // Same logic as the slash handler above — first instance to insert wins,
  // the other skips silently via duplicate-key error 11000.
  try {
    await CommandLock.create({ eventId: message.id });
  } catch (lockErr) {
    if (lockErr.code === 11000) return;
    console.error('[CommandLock] Unexpected error:', lockErr.message);
  }

  // ── MAINTENANCE MODE (prefix) ──
  // 'down' and 'downall' always pass through — the owner needs them to toggle maintenance off.
  // full=true  → block everyone except those two commands
  // active=true → block non-owners (owner can still run everything)
  const maintenancePassthrough = ['down', 'downall'];
  if (!maintenancePassthrough.includes(commandName)) {
    if (maintenance.full) {
      return message.reply({ content: 'Bot is in Maintenance, come back later', allowedMentions: { repliedUser: false } });
    }
    if (maintenance.active && message.author.id !== OWNER_ID) {
      return message.reply({ content: 'Bot is in Maintenance, come back later', allowedMentions: { repliedUser: false } });
    }
  }

  // Apply persistent channel restrictions before running the command.
  // Restriction-management commands are exempt so admins can always use
  // `op allow` to restore a channel.
  if (!['allow', 'disallow'].includes(command.name)) {
    try {
      const restriction = await getCommandRestriction(
        message.guild.id,
        message.channel.id,
        command.name
      );
      if (restriction.blocked) {
        const blockedMessage = restriction.blockAll
          ? `This bots commands can't be used here`
          : `**${command.name}** can't be used here`;
        return message.reply({
          content: blockedMessage,
          allowedMentions: { repliedUser: false }
        });
      }
    } catch (restrictionError) {
      console.error('[ChannelRestriction] Prefix check failed:', restrictionError.message);
    }
  }

  // ── GLOBAL COOLDOWN CHECK (prefix) ──
  // Same 2-second per-user-per-command guard as the slash handler above.
  const prefixCooldownKey = `${message.author.id}:${commandName}`;
  const prefixLastUsed    = globalCooldowns.get(prefixCooldownKey);
  const prefixNow         = Date.now();
  if (prefixLastUsed && (prefixNow - prefixLastUsed) < GLOBAL_COOLDOWN_MS) {
    const secsLeft = Math.ceil((GLOBAL_COOLDOWN_MS - (prefixNow - prefixLastUsed)) / 1000);
    const label    = secsLeft === 1 ? `second` : `seconds`;
    return message.reply({ content: `Wait **${secsLeft} ${label}** before using this command again`, allowedMentions: { repliedUser: false } });
  }
  globalCooldowns.set(prefixCooldownKey, prefixNow);

  try {
    // Register the account before running the command
    await registerAccount(message.author);

    // Run the command, passing the full message object
    // Commands that need args parse them from message.content directly
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await message.reply({
      content: 'Error running command.',
      allowedMentions: { repliedUser: false }
    });
  }
});

// ─────────────────────────────────────────────
// COMMAND LOADER
// ─────────────────────────────────────────────
// Automatically loads every .js file inside every subfolder of /commands/.
// Adding a new command file is all you need — no manual registration required.
const foldersPath    = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command  = require(filePath);

    // A valid command must have at least a 'name' and an 'execute' function
    if (command.name && command.execute) {
      client.commands.set(command.name, command); // Register by primary name

      // Also register any aliases (e.g. 'p' for 'pull', 'd' for 'daily')
      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          client.commands.set(alias, command);
        }
      }

      console.log(`Loaded command: ${command.name}`);
    }
  }
}

// Start the bot!
startBot();
