// ─────────────────────────────────────────────
// NOTIFICATION SCHEDULER
// ─────────────────────────────────────────────
// This module runs a background check every 60 seconds.
// Whenever a pull reset or daily reset fires, it DMs every player
// who has opted in to that notification in their /settings.
//
// IMPORTANT: only resets that happen AFTER the bot starts up are
// notified. Past resets are never back-filled, so players won't
// get spammed when the bot restarts.

// MessageFlags.IsComponentsV2 tells Discord that notification DMs use
// the newer component layout instead of the older plain-text format.
const { MessageFlags } = require('discord.js');
const User = require('../models/user');

// ─────────────────────────────────────────────
// EASTERN TIME DATE HELPERS
// ─────────────────────────────────────────────
// These are duplicated from pull.js and daily.js because each file
// runs independently. A future refactor could extract them to a
// shared utils/etHelpers.js, but duplication is clearer for beginners.

// Breaks a Date into its parts expressed in Eastern Time (handles DST automatically)
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

// Converts ET date+time back to UTC — tries both EDT (UTC-4) and EST (UTC-5)
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

// Generates all instances of a set of ET times across yesterday/today/tomorrow
// so we never miss a reset that straddles a day boundary.
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

// ─────────────────────────────────────────────
// RESET TIME DEFINITIONS
// ─────────────────────────────────────────────

// Pull windows reset three times a day at these ET clock times
const PULL_RESET_TIMES = [
  [6,  30], //  6:30 AM ET
  [14, 30], //  2:30 PM ET
  [22, 30]  // 10:30 PM ET
];

// The daily reward resets once a day at 10:30 PM ET
const DAILY_RESET_TIMES = [
  [22, 30]  // 10:30 PM ET
];

// ─────────────────────────────────────────────
// TRACKING — which resets have we already sent DMs for?
// ─────────────────────────────────────────────
// We store each notified reset as an ISO date string in a Set.
// Using a Set means looking up "did we already notify this reset?"
// is instant, no matter how many resets are stored.
//
// These are in-memory only — if the bot restarts, the Sets start
// empty, so only new resets after startup trigger DMs.
const notifiedPullResets  = new Set();
const notifiedDailyResets = new Set();

// ─────────────────────────────────────────────
// HELPER — send a DM without crashing if the user has DMs off
// ─────────────────────────────────────────────
// client.users.fetch(id) downloads a user object from Discord's API.
// Without it we can't call .send() on them.
async function tryDM(client, userId, content) {
  try {
    const discordUser = await client.users.fetch(userId);

    // Components V2 text is sent as a type 10 TextDisplay component.
    // Both pull and daily notifications use this helper, so both messages
    // automatically use the same component format.
    await discordUser.send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        {
          type: 10,
          content
        }
      ]
    });
  } catch {
    // The user has DMs disabled, blocked the bot, or was deleted.
    // We silently skip — this should never crash the notifier.
  }
}

// ─────────────────────────────────────────────
// CORE CHECK — runs every 60 seconds
// ─────────────────────────────────────────────
// "window" is the time range we care about: (lastCheckedAt, now].
// Any reset that landed inside that window is a new, un-notified reset.
let lastCheckedAt = new Date(); // Set at startup — prevents back-filling

async function checkAndNotify(client) {
  const now = new Date();

  try {
    // ── PULL RESET CHECK ──
    // Find any pull reset times that happened between the last check and now
    const newPullResets = getResetCandidates(now, PULL_RESET_TIMES).filter(t =>
      t > lastCheckedAt && t <= now && !notifiedPullResets.has(t.toISOString())
    );

    for (const resetTime of newPullResets) {
      // Mark this reset as handled FIRST so a slow DB query can't cause double-sends
      notifiedPullResets.add(resetTime.toISOString());

      // Find every player who opted in AND has actually pulled before.
      // Players who have never pulled don't need a "pulls are ready" DM.
      const users = await User.find({
        dmPullsReady:  true,
        lastPullTime:  { $ne: null }  // $ne means "not equal to" — i.e. has pulled at least once
      }).lean(); // .lean() returns plain JS objects instead of Mongoose documents — faster for reads

      console.log(`[Notifier] Pull reset at ${resetTime.toISOString()} — DMing ${users.length} users`);

      for (const user of users) {
        await tryDM(client, user.userId, 'Your pulls have been refreshed. Start pulling with `pull`');

        // Small pause between DMs to stay well under Discord's rate limits.
        // Without this, sending hundreds of DMs at once could cause errors.
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // ── DAILY RESET CHECK ──
    const newDailyResets = getResetCandidates(now, DAILY_RESET_TIMES).filter(t =>
      t > lastCheckedAt && t <= now && !notifiedDailyResets.has(t.toISOString())
    );

    for (const resetTime of newDailyResets) {
      notifiedDailyResets.add(resetTime.toISOString());

      // Find every player who opted in AND has claimed their daily at least once.
      // Brand-new players who have never claimed don't need a "daily is ready" DM.
      const users = await User.find({
        dmDailyReady:   true,
        lastDailyClaim: { $ne: null }
      }).lean();

      console.log(`[Notifier] Daily reset at ${resetTime.toISOString()} — DMing ${users.length} users`);

      for (const user of users) {
        await tryDM(client, user.userId, 'Your daily is ready. Claim it with `daily`');
        await new Promise(r => setTimeout(r, 100));
      }
    }

  } catch (err) {
    // A DB error or Discord API error should never kill the whole notifier.
    // Log it so the owner can see it, but let the next 60-second tick retry.
    console.error('[Notifier] Error during check:', err.message);
  }

  lastCheckedAt = now;
}

// ─────────────────────────────────────────────
// EXPORT — call this once after the bot is ready
// ─────────────────────────────────────────────
// Pass the Discord client so we can fetch users and send DMs.
function startNotifier(client) {
  // Set lastCheckedAt to right now so we never notify about past resets
  lastCheckedAt = new Date();
  console.log('[Notifier] Started — monitoring pull and daily resets');

  // Run immediately once, then every 60 seconds after that.
  // The immediate run handles the edge case where a reset happened
  // in the ~30 seconds between bot login and the first interval tick.
  checkAndNotify(client);
  setInterval(() => checkAndNotify(client), 60000);
}

module.exports = { startNotifier };
