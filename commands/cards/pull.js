const { SlashCommandBuilder } = require('discord.js');
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');

// --- CONFIGURATION ---
const PULL_LIMIT = 8;      // pulls allowed per reset window
const COOLDOWN_MS = 3000;  // 3 seconds between pulls

// Rank pull probabilities — must sum to 100
const RANK_PROBABILITIES = [
  { rank: 'D',  weight: 50.00 },
  { rank: 'C',  weight: 30.00 },
  { rank: 'B',  weight: 15.00 },
  { rank: 'A',  weight:  4.00 },
  { rank: 'S',  weight:  0.95 },
  { rank: 'SS', weight:  0.04 },
  { rank: 'UR', weight:  0.01 },
];

// Pre-build M1-only card pools grouped by rank (excludes blank-name cards)
const cardsByRank = {};
for (const card of cards) {
  if (!card.name) continue;
  const r = safeRank(card.rank);
  if (!cardsByRank[r]) cardsByRank[r] = [];
  cardsByRank[r].push(card);
}

// Roll a rank according to probability weights
function rollRank() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const { rank, weight } of RANK_PROBABILITIES) {
    cumulative += weight;
    if (roll < cumulative) return rank;
  }
  return 'D'; // safety fallback
}

// --- RESET TIME HELPERS (America/New_York) ---
// Global resets happen at 6:30 AM, 2:30 PM, and 10:30 PM Eastern time daily.
const RESET_TIMES_ET = [[6, 30], [14, 30], [22, 30]]; // [hour, minute]

// Parse the current time in ET and return its components
function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  // Format: "M/D/YYYY, HH:MM:SS"  (hour can be "24" at midnight)
  const match = str.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  return {
    year:   parseInt(match[3]),
    month:  parseInt(match[1]),
    day:    parseInt(match[2]),
    hour:   parseInt(match[4]) % 24,
    minute: parseInt(match[5]),
    second: parseInt(match[6])
  };
}

// Convert an ET date+time back to a UTC Date, handling DST automatically
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) { // try EDT (UTC-4) then EST (UTC-5)
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  // Fallback: assume EST
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

// Build a set of reset timestamps covering yesterday, today, and tomorrow
// (three days covers all edge cases near day boundaries)
function getResetCandidates(now) {
  const candidates = [];
  for (let d = -1; d <= 1; d++) {
    const shifted = new Date(now.getTime() + d * 86400000);
    const { year, month, day } = getETDateParts(shifted);
    for (const [h, m] of RESET_TIMES_ET) {
      candidates.push(etPartsToUtc(year, month, day, h, m));
    }
  }
  return candidates;
}

function getLastReset(now) {
  const past = getResetCandidates(now).filter(t => t <= now);
  return past.sort((a, b) => b - a)[0];
}

function getNextReset(now) {
  const future = getResetCandidates(now).filter(t => t > now);
  return future.sort((a, b) => a - b)[0];
}

// --- REPLY HELPER ---
// Sends a message visible only to the invoking user (ephemeral for slash, no-mention reply for prefix)
function sendPrivate(interactionOrMessage, content) {
  if (interactionOrMessage.isChatInputCommand?.()) {
    return interactionOrMessage.reply({ content, flags: 64 });
  }
  return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
}

// --- COMMAND ---
module.exports = {
  data: new SlashCommandBuilder()
    .setName('pull')
    .setDescription('Pull a random card.'),

  name: 'pull',
  aliases: ['p'],
  description: 'Pull a random card.',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const now = new Date();

    // Fetch or create the user's DB record
    let userData = await User.findOne({ userId: user.id });
    if (!userData) {
      userData = new User({ userId: user.id });
    }

    // --- 3-second cooldown check ---
    if (userData.lastPullTime) {
      const elapsed = now - userData.lastPullTime;
      if (elapsed < COOLDOWN_MS) {
        const secondsLeft = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        const label = secondsLeft === 1 ? 'second' : 'seconds';
        return sendPrivate(interactionOrMessage, `Wait **${secondsLeft} ${label}** before pulling again`);
      }
    }

    // --- Pull limit check (auto-reset when a new window has started) ---
    const lastReset = getLastReset(now);
    if (!userData.lastPullReset || userData.lastPullReset < lastReset) {
      userData.pullsUsed = 0;
      userData.lastPullReset = lastReset;
    }

    if (userData.pullsUsed >= PULL_LIMIT) {
      const nextReset = getNextReset(now);
      const resetTs = Math.floor(nextReset.getTime() / 1000);
      return sendPrivate(
        interactionOrMessage,
        `You've ran out of pulls. \`${userData.pullsUsed}/${PULL_LIMIT}\`\nNext reset in: <t:${resetTs}:R>`
      );
    }

    // --- Pick a card by rank probability then randomly within that rank ---
    let rank = rollRank();
    let pool = cardsByRank[rank];

    // If no cards exist for the rolled rank, fall through to the next available rank
    if (!pool || pool.length === 0) {
      for (const { rank: r } of RANK_PROBABILITIES) {
        if (cardsByRank[r]?.length > 0) { rank = r; pool = cardsByRank[r]; break; }
      }
    }
    if (!pool || pool.length === 0) {
      return sendPrivate(interactionOrMessage, 'No cards are available right now.');
    }

    const pulledCard = pool[Math.floor(Math.random() * pool.length)];

    // --- Build the embed with safe rank/stat resolution ---
    const resolvedRank = safeRank(pulledCard.rank);
    if (resolvedRank !== pulledCard.rank) {
      console.warn(`[Pull] Card "${pulledCard.name}" has invalid rank "${pulledCard.rank}". Using fallback rank D.`);
    }
    const visualSettings = rankConfig[resolvedRank].M1;

    const resolvedHealth = resolveStat(resolvedRank, 'health', safeStat(pulledCard.health));
    const resolvedPower  = resolveStat(resolvedRank, 'power',  safeStat(pulledCard.power));
    const resolvedSpeed  = resolveStat(resolvedRank, 'speed',  safeStat(pulledCard.speed));

    // --- Save pull to DB before replying ---
    userData.pullsUsed   += 1;
    userData.lastPullTime = now;
    await userData.save();

    const embed = {
      title: pulledCard.name,
      description: [
        `${pulledCard.title}`,
        ``,
        `**Health:** ${resolvedHealth}`,
        `**Power:** ${resolvedPower}`,
        `**Speed:** ${resolvedSpeed}`
      ].join('\n'),
      thumbnail: { url: visualSettings.icon },
      color: visualSettings.color,
      footer: { text: `This card was pulled by ${user.username} · ${userData.pullsUsed}/${PULL_LIMIT} pulls used` },
      image: { url: pulledCard.image }
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      if (interactionOrMessage.replied || interactionOrMessage.deferred) {
        await interactionOrMessage.followUp({ embeds: [embed] });
      } else {
        await interactionOrMessage.reply({ embeds: [embed] });
      }
    } else {
      await interactionOrMessage.channel.send({ embeds: [embed] });
    }
  },
};
