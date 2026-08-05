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

const User = require('../models/user');
const { ensureDailyQuests } = require('./quests');

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

    // Send a normal plain-text DM instead of an embed or component container.
    await discordUser.send(content);
  } catch {
    // The user has DMs disabled, blocked the bot, or was deleted.
    // We silently skip — this should never crash the notifier.
  }
}

async function tryGroupedDM(client, userId, messages) {
  if (!messages.length) return;
  await tryDM(client, userId, messages.join('\n\n'));
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
    // ── RESET CHECKS ──
    // Find any pull reset times that happened between the last check and now
    const newPullResets = getResetCandidates(now, PULL_RESET_TIMES).filter(t =>
      t > lastCheckedAt && t <= now && !notifiedPullResets.has(t.toISOString())
    );

    // ── DAILY RESET CHECK ──
    const newDailyResets = getResetCandidates(now, DAILY_RESET_TIMES).filter(t =>
      t > lastCheckedAt && t <= now && !notifiedDailyResets.has(t.toISOString())
    );

    // Pull and daily reset at 10:30 PM ET are one event for notifications.
    // Handle that pull reset in the grouped daily notification below.
    const dailyResetKeys = new Set(newDailyResets.map(reset => reset.toISOString()));
    for (const resetTime of newPullResets) {
      if (dailyResetKeys.has(resetTime.toISOString())) continue;

      notifiedPullResets.add(resetTime.toISOString());
      const users = await User.find({
        dmPullsReady: true,
        lastPullTime: { $ne: null }
      }).lean();

      console.log(`[Notifier] Pull reset at ${resetTime.toISOString()} — DMing ${users.length} users`);
      for (const user of users) {
        await tryGroupedDM(client, user.userId, [
          'Your pulls have been refreshed. Start pulling with `pull`'
        ]);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    for (const resetTime of newDailyResets) {
      notifiedDailyResets.add(resetTime.toISOString());
      const resetKey = resetTime.toISOString();
      if (newPullResets.some(pullReset => pullReset.toISOString() === resetKey)) {
        notifiedPullResets.add(resetKey);
      }

      // Assign the same reset window's random quests before sending the
      // notification. This also makes the quest page ready after a restart.
      const users = await User.find({});

      console.log(`[Notifier] Daily reset at ${resetTime.toISOString()} — DMing ${users.length} users`);

      for (const user of users) {
        ensureDailyQuests(user, now);
        await user.save();

        const messages = [];
        if (user.dmDailyReady && user.lastDailyClaim) {
          messages.push('Your daily is ready. Claim it with `daily`');
        }
        if (user.dmPullsReady && user.lastPullTime) {
          messages.push('Your pulls have been refreshed. Start pulling with `pull`');
        }
        if (user.dmQuestsReady !== false) {
          messages.push('Your daily quests are ready. View them with `quests`');
        }
        // Duel rewards become available at this same daily reset. Do not
        // notify players who have never earned one yet — their reward was
        // already ready when they started, so there is no new cooldown ending.
        if (
          user.dmDuelReward !== false &&
          user.lastDuelRewardAt &&
          user.lastDuelRewardAt < resetTime
        ) {
          messages.push('Your daily duel reward is ready. Win a qualified duel to claim it');
        }

        await tryGroupedDM(client, user.userId, messages);
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
