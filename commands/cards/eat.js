const { SlashCommandBuilder } = require('discord.js');

// User model to read/update meat count and pull tracking
const User = require('../../models/user');
const { updateQuestProgress } = require('../../utils/quests');

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

// Must match the value in pull.js — this is the max pulls per reset window
const PULL_LIMIT = 8;

// Cost in Meat to reset your pulls
const EAT_COST = 1;

// ─────────────────────────────────────────────
// RESET TIME HELPERS
// ─────────────────────────────────────────────
// These are the same helpers used in pull.js.
// They figure out when the current pull reset window started so we know
// whether the user has used any pulls yet in this window.

const RESET_TIMES_ET = [[6, 30], [14, 30], [22, 30]]; // [hour, minute] in Eastern Time

// Breaks a UTC Date into its Eastern Time components (handles daylight saving)
function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const match = str.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  return {
    year: parseInt(match[3]), month: parseInt(match[1]), day: parseInt(match[2]),
    hour: parseInt(match[4]) % 24, minute: parseInt(match[5]), second: parseInt(match[6])
  };
}

// Converts an Eastern Time date+time to a UTC Date object
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const p = getETDateParts(candidate);
    if (p.hour === hour % 24 && p.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

// Builds a list of all reset timestamps across yesterday, today, and tomorrow
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

// Returns the most recent reset time that has already passed
function getLastReset(now) {
  return getResetCandidates(now).filter(t => t <= now).sort((a, b) => b - a)[0];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/eat)
  data: new SlashCommandBuilder()
    .setName('eat')
    .setDescription(`Reset your pull count`),

  // Prefix command definition (op eat)
  name: 'eat',
  aliases: [`reset`],
  description: 'Reset your pull count',
  
  async execute(interactionOrMessage) {
    const user   = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const now    = new Date();

    // Load the player's save data
    let userData = await User.findOne({ userId: user.id });
    if (!userData) userData = new User({ userId: user.id });

    // ── STEP 1: Detect and apply the current pull reset window ──
    // If a new reset has passed since the user's last recorded one, their pulls
    // are already refreshed — treat pullsUsed as 0 for this check.
    const lastReset = getLastReset(now);
    if (!userData.lastPullReset || userData.lastPullReset < lastReset) {
      userData.pullsUsed    = 0;
      userData.lastPullReset = lastReset;
      await userData.save();
    }

    // ── STEP 2: Check if the user still has unused pulls ──
    // Eating when you haven't used any pulls is a waste — warn the player instead.
    if (userData.pullsUsed === 0) {
      const pullsLeft = PULL_LIMIT; // They have all their pulls remaining
      const content   = `You still have **${pullsLeft}** pulls to do`;

      if (isSlash) {
        return interactionOrMessage.reply({ content, flags: 64 }); // ephemeral
      }
      return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    // ── STEP 3: Check if the user has enough Meat ──
    if (!userData.meat || userData.meat < EAT_COST) {
      const content = `You don't have any <:meatrbg:1532524176701657248> Meat`;
      if (isSlash) {
        return interactionOrMessage.reply({ content, flags: 64 });
      }
      return interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    // ── STEP 4: Consume the Meat and reset pulls ──
    userData.meat      -= EAT_COST;  // Deduct 1 meat
    userData.pullsUsed  = 0;         // Reset pulls back to 0 (player gets a fresh window)
    updateQuestProgress(userData, 'eat', 1);
    await userData.save();

    // ── STEP 5: Confirm success ──
    // For prefix commands: react to the user's message with a green checkmark.
    // For slash commands: send a short ephemeral reply (can't react to slash messages).
    if (isSlash) {
      return interactionOrMessage.reply({ content: 'Your pulls have been reset', flags: 64 });
    } else {
      await interactionOrMessage.react('<:Success:1533154745731256531>');
    }
  }
};
