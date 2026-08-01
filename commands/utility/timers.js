const { SlashCommandBuilder } = require('discord.js');

// The User model so we can check when the player last claimed their daily
const User = require('../../models/user');

// ─────────────────────────────────────────────
// RESET TIME HELPERS
// ─────────────────────────────────────────────
// Two sets of reset timers are tracked here:
//
//   PULL RESETS — happen 3 times a day at 6:30 AM, 2:30 PM, and 10:30 PM ET
//   DAILY RESET — happens once a day at 10:30 PM ET
//
// All times use Eastern Time (America/New_York) which automatically handles
// Daylight Saving Time (EDT in summer, EST in winter) — you don't have to
// change anything when the clocks change.

// Breaks a Date into its individual parts expressed in Eastern Time.
function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
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

// Converts an ET date+time back to a UTC Date object (handles DST automatically).
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

// Generates reset timestamps across yesterday, today, and tomorrow.
// resetTimesET is an array of [hour, minute] pairs in ET.
function getResetCandidates(now, resetTimesET) {
  const candidates = [];
  for (let d = -1; d <= 1; d++) {
    const shifted = new Date(now.getTime() + d * 86400000);
    const { year, month, day } = getETDateParts(shifted);
    for (const [h, m] of resetTimesET) {
      candidates.push(etPartsToUtc(year, month, day, h, m));
    }
  }
  return candidates;
}

// Pull reset times: three per day
const PULL_RESET_TIMES = [
  [6,  30], //  6:30 AM ET
  [14, 30], //  2:30 PM ET
  [22, 30], // 10:30 PM ET
];

// Daily reset time: once per day
const DAILY_RESET_TIMES = [
  [22, 30], // 10:30 PM ET
];

// Returns the next upcoming pull reset
function getNextPullReset(now) {
  const future = getResetCandidates(now, PULL_RESET_TIMES).filter(t => t > now);
  return future.sort((a, b) => a - b)[0];
}

// Returns the most recent pull reset (to check if the player's window expired)
function getLastPullReset(now) {
  const past = getResetCandidates(now, PULL_RESET_TIMES).filter(t => t <= now);
  return past.sort((a, b) => b - a)[0];
}

// Returns the next upcoming daily reset
function getNextDailyReset(now) {
  const future = getResetCandidates(now, DAILY_RESET_TIMES).filter(t => t > now);
  return future.sort((a, b) => a - b)[0];
}

// Returns the most recent daily reset
function getLastDailyReset(now) {
  const past = getResetCandidates(now, DAILY_RESET_TIMES).filter(t => t <= now);
  return past.sort((a, b) => b - a)[0];
}

// ─────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────
// Converts a millisecond duration into a "Xh Ym" string.
// If the time is 0 or negative, returns "Ready" instead of a countdown.
function formatTimeLeft(ms) {
  if (ms <= 0) return 'Ready';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const mins  = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  // If there are 0 hours, just show minutes (e.g. "14m" instead of "0h 14m")
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

// Converts a millisecond duration into a "Xm Ys" string (used for short cooldowns).
// Returns "Ready" if the time has already passed.
function formatMinSec(ms) {
  if (ms <= 0) return 'Ready';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// The manga command has a 20-minute rolling cooldown (not a global reset time)
const MANGA_COOLDOWN_MS = 20 * 60 * 1000;

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('timers')
    .setDescription('Check your active cooldowns'),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'timers',
  aliases: ['cooldowns', 't'], // 'op cooldowns' and 'op t' both work
  description: 'Shows all active timers and cooldowns.',

  async execute(interactionOrMessage) {
    const user   = interactionOrMessage.user || interactionOrMessage.author;
    const userId = user.id;
    const now    = new Date();

    // Load the player's save data so we can check their daily claim time
    const userData = await User.findOne({ userId });

    // ── PULL RESET ──
    // "Next reset" = time until pulls refresh
    // If the player still has pulls left this window, the next reset is still in the future.
    // If they're out of pulls, same logic — just shows the nearest upcoming reset.
    const nextPullReset    = getNextPullReset(now);
    const pullResetMs      = nextPullReset - now;
    const pullResetDisplay = formatTimeLeft(pullResetMs);

    // ── DAILY RESET ──
    // "Next daily" = time until their daily becomes claimable again.
    // If they haven't claimed yet (or never claimed), show "Ready".
    // If they claimed after the last reset, show countdown to the next one.
    let dailyDisplay;
    if (!userData?.lastDailyClaim) {
      // Never claimed — it's available right now
      dailyDisplay = 'Ready';
    } else {
      const lastDailyReset = getLastDailyReset(now);
      if (userData.lastDailyClaim < lastDailyReset) {
        // Their last claim was BEFORE the most recent reset — they can claim again now
        dailyDisplay = 'Ready';
      } else {
        // They claimed AFTER the last reset — show how long until the next one
        const nextDailyReset = getNextDailyReset(now);
        dailyDisplay = formatTimeLeft(nextDailyReset - now);
      }
    }

    // ── MANGA COOLDOWN ──
    // Rolling 20-minute personal timer. "Ready" if never played or cooldown expired.
    let mangaDisplay;
    if (!userData?.lastMangaClaim) {
      // Never played the manga challenge
      mangaDisplay = 'Ready';
    } else {
      const elapsed   = now - userData.lastMangaClaim;
      const remaining = MANGA_COOLDOWN_MS - elapsed;
      mangaDisplay = formatMinSec(remaining); // Returns "Ready" if remaining <= 0
    }

    // ── BUILD AND SEND THE MESSAGE ──
    // Plain text, no embed. Each timer is on its own line.
    const content = [
      `**Next Reset**: \`${pullResetDisplay}\``,
      `**Next Daily**: \`${dailyDisplay}\``,
      `**Next Manga**: \`${mangaDisplay}\``,
    ].join('\n');

    if (interactionOrMessage.isChatInputCommand?.()) {
      await interactionOrMessage.reply({ content });
    } else {
      await interactionOrMessage.channel.send(content);
    }
  }
};
