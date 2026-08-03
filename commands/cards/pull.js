const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

// Card data, visual config, and helper functions from the central card library
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');

// The User model so we can read/write each player's save data in MongoDB
const User = require('../../models/user');

// Shiny image generators — create the holographic card image and rank icon
const { generateShinyImage, generateShinyIcon } = require('../../utils/shinyImage');

// ─────────────────────────────────────────────
// CONFIGURATION — easy values to tweak later
// ─────────────────────────────────────────────

// How many pulls each player gets per reset window
const PULL_LIMIT = 8;

// How long a player must wait between pulls (in milliseconds). 3000ms = 3 seconds.
const COOLDOWN_MS = 3000;

// 1% chance that any pull lands as a shiny version of the card.
// A shiny card is permanent — pulling duplicates later never removes the shiny status.
const SHINY_CHANCE = 0.01;

// Emoji that appears before a shiny card's name in the pull embed title
const SHINY_EMOJI = `<:holo:1533666993637687466>`;

// Pull odds for each rank — these must add up to exactly 100.
// Higher weight = more likely to appear. UR at 0.01% means ~1 in 10,000 pulls.
const RANK_PROBABILITIES = [
  { rank: 'D',  weight: 50.00 },
  { rank: 'C',  weight: 30.00 },
  { rank: 'B',  weight: 15.00 },
  { rank: 'A',  weight:  4.00 },
  { rank: 'S',  weight:  0.95 },
  { rank: 'SS', weight:  0.04 },
  { rank: 'UR', weight:  0.01 },
];

// ─────────────────────────────────────────────
// CARD POOL SETUP
// ─────────────────────────────────────────────
// Build a lookup table of { rank → [cards of that rank] } at startup.
// This runs once when the bot loads, not on every pull — much faster.
// We only use M1 (base) cards here; M2/M3 upgrades are shown in the info command.
const cardsByRank = {};
for (const card of cards) {
  if (!card.name) continue; // Skip blank template cards
  const r = safeRank(card.rank); // safeRank converts unknown ranks to 'D' instead of crashing
  if (!cardsByRank[r]) cardsByRank[r] = [];
  cardsByRank[r].push(card);
}

// ─────────────────────────────────────────────
// RANK ROLLER
// ─────────────────────────────────────────────
// Picks a rank according to the probability weights above.
// Works like a weighted dice roll:
//   - Roll a random number between 0 and 100
//   - Walk through the ranks, adding their weights cumulatively
//   - The first rank whose cumulative total exceeds the roll is the winner
function rollRank() {
  const roll = Math.random() * 100; // e.g. 62.4
  let cumulative = 0;
  for (const { rank, weight } of RANK_PROBABILITIES) {
    cumulative += weight;
    if (roll < cumulative) return rank;
    // e.g. D covers 0–50, C covers 50–80, B covers 80–95, etc.
  }
  return 'D'; // Safety fallback — should never be reached if weights sum to 100
}

// ─────────────────────────────────────────────
// RESET TIME HELPERS
// ─────────────────────────────────────────────
// Pulls reset globally three times a day at fixed Eastern Time (ET) clock times.
// These helpers figure out when the last reset happened and when the next one is,
// which is how we know whether to wipe a player's pullsUsed counter.

// Reset times in Eastern Time (America/New_York — handles daylight saving automatically)
const RESET_TIMES_ET = [
  [6,  30], //  6:30 AM ET
  [14, 30], //  2:30 PM ET
  [22, 30], // 10:30 PM ET
];

// Breaks a Date object into its individual parts (year, month, day, hour, etc.)
// expressed in Eastern Time. This lets us compare times in ET without manual math.
function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  // toLocaleString returns something like "7/30/2026, 14:35:22"
  const match = str.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  return {
    year:   parseInt(match[3]),
    month:  parseInt(match[1]),
    day:    parseInt(match[2]),
    hour:   parseInt(match[4]) % 24, // 24:xx at midnight → 0:xx
    minute: parseInt(match[5]),
    second: parseInt(match[6])
  };
}

// Converts an ET date+time back to a UTC Date object.
// It tries both EDT (UTC-4, used in summer) and EST (UTC-5, used in winter)
// to automatically handle daylight saving time transitions.
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    // Verify the round-trip: if this UTC time shows the correct ET hour, it's right
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute)); // Fallback: assume EST
}

// Generates all possible reset timestamps across yesterday, today, and tomorrow.
// We check three days because a reset near midnight might belong to a different calendar day.
function getResetCandidates(now) {
  const candidates = [];
  for (let d = -1; d <= 1; d++) {
    const shifted = new Date(now.getTime() + d * 86400000); // 86400000ms = 1 day
    const { year, month, day } = getETDateParts(shifted);
    for (const [h, m] of RESET_TIMES_ET) {
      candidates.push(etPartsToUtc(year, month, day, h, m));
    }
  }
  return candidates;
}

// Returns the most recent reset time that has already passed
function getLastReset(now) {
  const past = getResetCandidates(now).filter(t => t <= now);
  return past.sort((a, b) => b - a)[0]; // Sort descending, take the first (most recent)
}

// Returns the next upcoming reset time
function getNextReset(now) {
  const future = getResetCandidates(now).filter(t => t > now);
  return future.sort((a, b) => a - b)[0]; // Sort ascending, take the first (soonest)
}

// ─────────────────────────────────────────────
// REPLY HELPER
// ─────────────────────────────────────────────
// Cooldown and out-of-pulls messages should only be visible to the user who pulled.
// For slash commands, "flags: 64" makes the reply ephemeral (only they can see it).
// For prefix commands, allowedMentions prevents the bot from pinging the user.
function sendPrivate(interactionOrMessage, content) {
  if (interactionOrMessage.isChatInputCommand?.()) {
    return interactionOrMessage.reply({ content, flags: 64 });
  }
  return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/pull)
  data: new SlashCommandBuilder()
    .setName('pull')
    .setDescription('Pull a random card'),

  // Prefix command definition (op pull / op p)
  name: 'pull',
  aliases: ['p'],
  description: 'Pull a random card',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const now = new Date();

    // ── STEP 1: Load the player's save data (or create one if it's their first time) ──
    let userData = await User.findOne({ userId: user.id });
    if (!userData) {
      userData = new User({ userId: user.id });
    }

    // ── STEP 2: Check the 3-second cooldown ──
    // If the player pulled less than 3 seconds ago, tell them how long to wait.
    if (userData.lastPullTime) {
      const elapsed = now - userData.lastPullTime; // Time since last pull in ms
      if (elapsed < COOLDOWN_MS) {
        const secondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        const label = secondsLeft === 1 ? 'second' : 'seconds';
        return sendPrivate(interactionOrMessage, `Wait **${secondsLeft} ${label}** before pulling again`);
      }
    }

    // ── STEP 3: Check the pull limit (and auto-reset if a new window started) ──
    // Find out when the most recent global reset happened.
    const lastReset = getLastReset(now);
    // If the player's last recorded reset is older than the most recent global reset,
    // their pulls window has expired — give them a fresh set of pulls.
    if (!userData.lastPullReset || userData.lastPullReset < lastReset) {
      userData.pullsUsed = 0;
      userData.lastPullReset = lastReset;
    }
    // If they've used all their pulls, tell them when the next reset is.
    if (userData.pullsUsed >= PULL_LIMIT) {
      const nextReset    = getNextReset(now);
      const remainingMs  = nextReset - now;
      const resetHours   = Math.floor(remainingMs / (1000 * 60 * 60));
      const resetMins    = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      return sendPrivate(
        interactionOrMessage,
        `You've ran out of pulls. \`${userData.pullsUsed}/${PULL_LIMIT}\`\nNext reset in: \`${resetHours}h ${resetMins}m\``
      );
    }

    // ── STEP 4: Roll for a rank, then pick a random card from that rank ──
    let rank = rollRank(); // e.g. 'B'
    let pool = cardsByRank[rank]; // All B-rank cards

    // Safety: if the rolled rank has no cards (e.g. nobody added any UR cards yet),
    // fall through to the next rank that actually has cards.
    if (!pool || pool.length === 0) {
      for (const { rank: r } of RANK_PROBABILITIES) {
        if (cardsByRank[r]?.length > 0) { rank = r; pool = cardsByRank[r]; break; }
      }
    }
    if (!pool || pool.length === 0) {
      return sendPrivate(interactionOrMessage, 'No cards are available right now.');
    }

    // Pick a random card from the pool
    const pulledCard = pool[Math.floor(Math.random() * pool.length)];

    // ── STEP 5: Roll for shiny ──
    // Each pull has a 1% chance of being a shiny version of the card.
    // Shiny is permanent — once a card is shiny, it stays shiny forever.
    // Pulling a non-shiny duplicate later does NOT remove the shiny status.
    const isShinyPull = Math.random() < SHINY_CHANCE;

    // ── STEP 6: Resolve the card's stats ──
    // safeRank catches invalid rank values; resolveStat converts filter strings to numbers.
    // We pass pulledCard.name + mastery 1 so stats are fixed — the same card always
    // shows the same numbers no matter who pulls it or how many times.
    const resolvedRank = safeRank(pulledCard.rank);
    if (resolvedRank !== pulledCard.rank) {
      console.warn(`[Pull] Card "${pulledCard.name}" has invalid rank "${pulledCard.rank}". Using fallback rank D.`);
    }
    const visualSettings = rankConfig[resolvedRank].M1;

    const resolvedHealth = resolveStat(resolvedRank, 'health', safeStat(pulledCard.health), pulledCard.name, 1);
    const resolvedPower  = resolveStat(resolvedRank, 'power',  safeStat(pulledCard.power),  pulledCard.name, 1);
    const resolvedSpeed  = resolveStat(resolvedRank, 'speed',  safeStat(pulledCard.speed),  pulledCard.name, 1);

    // ── STEP 7: Track the copy in the player's collection ──
    const existingCopy = userData.cardCopies?.find(c => c.cardName === pulledCard.name);
    if (existingCopy) {
      // They already have at least one copy — increment the count
      existingCopy.amount += 1;
      existingCopy.lastObtained = now;
      // Only upgrade to shiny — never remove an existing shiny status
      if (isShinyPull && !existingCopy.shiny) {
        existingCopy.shiny = true;
      }
    } else {
      // First time they've pulled this card — add a new entry to their collection
      userData.cardCopies.push({
        cardName: pulledCard.name,
        amount: 1,
        lastObtained: now,
        shiny: isShinyPull // true only if this pull rolled shiny
      });
    }

    // ── STEP 8: Save everything to the database ──
    userData.pullsUsed   += 1;
    userData.lastPullTime = now;
    await userData.save(); // Writes all the changes above to MongoDB

    // ── STEP 9: Build the shiny image files (if this pull is shiny) ──
    // Generates a holographic rainbow overlay on both the card image and the rank icon.
    // Both are uploaded as Discord file attachments and referenced via attachment:// URLs.
    let files      = [];
    let imageUrl   = pulledCard.image;    // Default: plain card image URL
    let iconUrl    = visualSettings.icon; // Default: plain rank icon URL
    const cardTitle = isShinyPull
      ? `${SHINY_EMOJI} ${pulledCard.name}` // Shiny prefix emoji before the name
      : pulledCard.name;

    if (isShinyPull) {
      // Generate both images in parallel so we don't wait for one before starting the other
      const [cardBuf, iconBuf] = await Promise.all([
        generateShinyImage(pulledCard.image, pulledCard.name),
        generateShinyIcon(visualSettings.icon)
      ]);
      files    = [
        new AttachmentBuilder(cardBuf, { name: `shiny_card.png` }),
        new AttachmentBuilder(iconBuf, { name: `shiny_icon.png` })
      ];
      imageUrl = `attachment://shiny_card.png`;
      iconUrl  = `attachment://shiny_icon.png`;
    }

    // ── STEP 10: Build and send the pull embed ──
    const embed = {
      title: cardTitle,
      description: [
        `${pulledCard.title}`,
        ``,
        `**Health:** ${resolvedHealth}`,
        `**Power:** ${resolvedPower}`,
        `**Speed:** ${resolvedSpeed}`
      ].join('\n'),
      thumbnail: { url: iconUrl },
      color: visualSettings.color,
      // Footer shows pull count so players always know how many they have left
      footer: { text: `This card was pulled by ${user.username} · ${userData.pullsUsed}/${PULL_LIMIT}` },
      image: { url: imageUrl }
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      if (interactionOrMessage.replied || interactionOrMessage.deferred) {
        await interactionOrMessage.followUp({ embeds: [embed], files });
      } else {
        await interactionOrMessage.reply({ embeds: [embed], files });
      }
    } else {
      await interactionOrMessage.channel.send({ embeds: [embed], files });
    }
  },
};
