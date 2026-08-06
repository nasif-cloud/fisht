// ─────────────────────────────────────────────
// LEVEL AND XP HELPERS
// ─────────────────────────────────────────────
// XP requirements start at 150 XP for level 1 → level 2, then increase
// by 5 XP for each subsequent level.

const XP_PER_LEVEL_BASE = 150;
const XP_PER_LEVEL_INCREMENT = 5;
const LEVEL_UP_BELI = 10_000;
const LEVEL_UP_MEAT = 3;
const { updateQuestProgress } = require('./quests');

function getXpForNextLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return XP_PER_LEVEL_BASE + XP_PER_LEVEL_INCREMENT * (safeLevel - 1);
}

function getLevelProgress(totalXp = 0) {
  let xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  let xpNeeded = getXpForNextLevel(level);

  while (xp >= xpNeeded) {
    xp -= xpNeeded;
    level += 1;
    xpNeeded = getXpForNextLevel(level);
  }

  return {
    level,
    currentXp: xp,
    xpNeeded,
    xpToNextLevel: xpNeeded - xp
  };
}

// Add XP to one user and apply every level-up reward reached by that XP.
// The caller saves the user after calling this function.
function addXp(userData, amount) {
  if (!userData) {
    throw new Error('Cannot award XP without a user save');
  }

  const before = getLevelProgress(userData.xp);
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));

  // Older accounts may have reached levels before Meat rewards were saved.
  // Reconcile those levels once, then track the highest rewarded level so
  // future XP grants cannot award the same Meat twice.
  const storedMeatLevel = Number(userData.levelUpMeatAwardedThrough);
  const awardedThrough = Number.isFinite(storedMeatLevel) && storedMeatLevel >= 1
    ? Math.floor(storedMeatLevel)
    : 1;
  const missedLevels = Math.max(0, before.level - awardedThrough);
  if (missedLevels > 0) {
    userData.meat = (Number(userData.meat) || 0) + missedLevels * LEVEL_UP_MEAT;
  }

  userData.xp = Math.max(0, Number(userData.xp) || 0) + safeAmount;
  updateQuestProgress(userData, 'xp', safeAmount);

  const after = getLevelProgress(userData.xp);
  const levelsGained = Math.max(0, after.level - before.level);

  if (levelsGained > 0) {
    userData.balance = (Number(userData.balance) || 0) + levelsGained * LEVEL_UP_BELI;
    userData.meat = (Number(userData.meat) || 0) + levelsGained * LEVEL_UP_MEAT;
  }
  userData.levelUpMeatAwardedThrough = Math.max(before.level, after.level);

  return {
    amount: safeAmount,
    before,
    after,
    levelsGained
  };
}

// Send one clear level-up message for each new level. The setting controls
// whether the message goes to DMs or the channel where the reward happened.
// When a result message is supplied, channel notifications reply to it.
async function sendLevelUpNotifications(discordUser, userData, xpResult, channel, replyTo = null) {
  if (!discordUser || userData?.accountCreated !== true || xpResult?.levelsGained < 1) {
    return;
  }

  for (let level = xpResult.before.level + 1; level <= xpResult.after.level; level += 1) {
    try {
      const isDm = Boolean(userData.dmLevelUp);
      const destination = isDm ? discordUser : channel;
      if (!destination?.send) {
        console.warn(`[Levels] No notification destination for level ${level}`);
        continue;
      }

      const content =
        `${isDm ? 'You' : `<@${discordUser.id}>`} leveled up to **level ${level}** and received:\n` +
        `<:whitearrow:1532531439445344547> ${LEVEL_UP_BELI.toLocaleString('en-US')}<:SilverCoin:1534757841867374782>\n` +
        `<:whitearrow:1532531439445344547> ${LEVEL_UP_MEAT} <:Meat:1534757966119567501>`;
      const payload = {
        content,
        allowedMentions: isDm
          ? { parse: [] }
          : { users: [discordUser.id], repliedUser: false }
      };

      if (!isDm && replyTo?.id) {
        payload.reply = {
          messageReference: replyTo.id,
          failIfNotExists: false
        };
      }

      await destination.send(payload);
    } catch {
      // DMs may be closed; the saved rewards should not be rolled back.
    }
  }
}

function formatXpReward(xpResult) {
  return `You received **${xpResult.amount} XP**`;
}

module.exports = {
  LEVEL_UP_BELI,
  LEVEL_UP_MEAT,
  getXpForNextLevel,
  getLevelProgress,
  addXp,
  sendLevelUpNotifications,
  formatXpReward
};