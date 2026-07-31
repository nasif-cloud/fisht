require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs   = require('fs');

// The User model — needed so we can register new accounts automatically
const User = require('./models/user');

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

async function registerAccount(discordUser) {
  try {
    // Look for an existing save file for this user
    let userData = await User.findOne({ userId: discordUser.id });

    // If no save file exists yet, create one (brand new player)
    if (!userData) {
      userData = new User({ userId: discordUser.id });
    }

    // If the account hasn't been set up yet, give starter rewards
    if (!userData.accountCreated) {
      userData.balance        += STARTER_BERRIES; // Give starting Berries
      userData.meat           += STARTER_MEAT;    // Give starting Meat
      userData.accountCreated  = true;            // Mark as done so this never runs again
      await userData.save();

      // Try to DM the player a welcome message.
      // If their DMs are closed, we silently skip — the bot shouldn't crash over this.
      try {
        await discordUser.send(
          'Your account has been created. You received:\n' +
          `<:money:1532532493578928178> **${STARTER_BERRIES.toLocaleString('en-US')}** Berries\n` +
          `<:meatrbg:1532524176701657248> **${STARTER_MEAT}** Meat`
        );
      } catch {
        // DMs are disabled for this user — skip silently
      }
    }
  } catch (err) {
    // If something unexpected goes wrong during registration, log it but
    // don't let it stop the command from running.
    console.error('[registerAccount] Error:', err);
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
});

// ─────────────────────────────────────────────
// EVENT: SLASH COMMANDS
// ─────────────────────────────────────────────
// This fires every time someone uses a / command in Discord.
client.on('interactionCreate', async interaction => {
  // Ignore anything that isn't a slash command (e.g. buttons, dropdowns)
  // — those are handled inside their own command files via collectors.
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    // Register the account before running the command so the user always
    // has a save file by the time the command code runs.
    await registerAccount(interaction.user);

    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    // Tell Discord we handled the interaction (otherwise the command shows as failed)
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
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

  try {
    // Register the account before running the command
    await registerAccount(message.author);

    // Run the command, passing the full message object
    // Commands that need args parse them from message.content directly
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await message.channel.send('Error running command.');
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
