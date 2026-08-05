const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// The User model lets us read and update the player's balance and claim timestamp
const User = require('../../models/user');
const {
  addXp,
  sendLevelUpNotifications,
  formatXpReward
} = require('../../utils/levels');

// How many Berries the player earns per daily claim
const DAILY_REWARD = 2500;

// ─────────────────────────────────────────────
// DAILY RESET HELPERS
// ─────────────────────────────────────────────
// The daily reward resets GLOBALLY at 10:30 PM Eastern Time every night.
// "Global" means everyone's clock resets at the same moment — it's not a
// rolling 24-hour timer per person. Once that ET clock ticks to 10:30 PM,
// everyone's daily becomes claimable again at the same time.
//
// These helpers figure out when the last 10:30 PM ET happened (so we can
// check if the player already claimed during this window) and when the
// next one is (so we can show the countdown).

// Breaks a Date object into its individual parts expressed in Eastern Time.
// This automatically handles Daylight Saving Time (EDT vs EST) for us.
function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  // toLocaleString returns something like "7/30/2026, 22:35:14"
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
// Tries both EDT (UTC-4, summer) and EST (UTC-5, winter) to handle DST correctly.
function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute)); // Fallback: assume EST
}

// Generates the 10:30 PM ET reset times for yesterday, today, and tomorrow.
// We check three days because a reset near midnight might belong to a different calendar date.
function getDailyResetCandidates(now) {
  const candidates = [];
  for (let d = -1; d <= 1; d++) {
    const shifted = new Date(now.getTime() + d * 86400000); // 86400000ms = 1 day
    const { year, month, day } = getETDateParts(shifted);
    candidates.push(etPartsToUtc(year, month, day, 22, 30)); // 10:30 PM ET = 22:30
  }
  return candidates;
}

// Returns the most recent 10:30 PM ET reset that has already passed
function getLastDailyReset(now) {
  const past = getDailyResetCandidates(now).filter(t => t <= now);
  return past.sort((a, b) => b - a)[0]; // Most recent first
}

// Returns the next upcoming 10:30 PM ET reset
function getNextDailyReset(now) {
  const future = getDailyResetCandidates(now).filter(t => t > now);
  return future.sort((a, b) => a - b)[0]; // Soonest first
}

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Rewards'),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'daily',
  aliases: ['d'],
  description: 'Claim your daily rewards.',

  async execute(interactionOrMessage) {
    const user   = interactionOrMessage.author || interactionOrMessage.user;
    const userId = user.id;

    // Load the user's save data from MongoDB
    let userData = await User.findOne({ userId });
    if (!userData) {
      // This shouldn't happen (index.js creates the account first), but just in case
      userData = new User({ userId });
    }

    const now            = new Date();
    const lastReset      = getLastDailyReset(now);  // When did the last 10:30 PM ET happen?
    const nextReset      = getNextDailyReset(now);  // When does the next one happen?

    // Has this player already claimed AFTER the most recent reset?
    // If yes, they have to wait until the next one.
    if (userData.lastDailyClaim && userData.lastDailyClaim >= lastReset) {
      const remainingMs    = nextReset - now;
      const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
      const remainingMins  = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

      // Plain text reply (no embed) — shown publicly for prefix, ephemerally for slash
      const content = `You already claimed your daily. Come back in \`${remainingHours}h ${remainingMins}m\``;

      if (interactionOrMessage.isChatInputCommand?.()) {
        return interactionOrMessage.reply({ content, flags: 64 }); // ephemeral (only visible to them)
      } else {
        return interactionOrMessage.channel.send(content);
      }
    }

    // Award the daily Berries and record the claim time
    userData.balance        += DAILY_REWARD;
    userData.lastDailyClaim  = now;
    const xpResult = addXp(userData, 30);
    await userData.save();

    // Format the new balance with commas for display (e.g. 2500 → "2,500")
    const newBalance = userData.balance.toLocaleString('en-US');

    const successEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Daily Claimed')
      .setDescription(
        `<:whitearrow:1532531439445344547> You received **${DAILY_REWARD.toLocaleString('en-US')}** <:money:1532532493578928178> Berries\n` +
        `${formatXpReward(xpResult)}`
      )
      // Discord renders this timestamp in each viewer's local timezone and
      // includes the actual reset date instead of hard-coding an ET label.
      .setFooter({
        text: `Next claim resets <t:${Math.floor(nextReset.getTime() / 1000)}:F>`
      });

    let resultMessage;
    if (interactionOrMessage.isChatInputCommand?.()) {
      if (interactionOrMessage.replied || interactionOrMessage.deferred) {
        resultMessage = await interactionOrMessage.followUp({ embeds: [successEmbed], fetchReply: true });
      } else {
        resultMessage = await interactionOrMessage.reply({ embeds: [successEmbed], fetchReply: true });
      }
    } else {
      resultMessage = await interactionOrMessage.channel.send({ embeds: [successEmbed] });
    }

    await sendLevelUpNotifications(
      user,
      userData,
      xpResult,
      interactionOrMessage.channel,
      resultMessage
    );
  }
};
