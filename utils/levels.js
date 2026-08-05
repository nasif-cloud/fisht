// ─────────────────────────────────────────────
// LEVEL AND XP HELPERS
// ─────────────────────────────────────────────
// XP requirements start at 150 XP for level 1 → level 2, then increase
// by 5 XP for each subsequent level.

const XP_PER_LEVEL_BASE = 150;
const XP_PER_LEVEL_INCREMENT = 5;
const LEVEL_UP_BELI = 10_000;
const LEVEL_UP_RESET_TOKENS = 3;
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

  userData.xp = Math.max(0, Number(userData.xp) || 0) + safeAmount;
  updateQuestProgress(userData, 'xp', safeAmount);

  const after = getLevelProgress(userData.xp);
  const levelsGained = Math.max(0, after.level - before.level);

  if (levelsGained > 0) {
    userData.balance = (Number(userData.balance) || 0) + levelsGained * LEVEL_UP_BELI;
    userData.resetTokens =
      (Number(userData.resetTokens) || 0) + levelsGained * LEVEL_UP_RESET_TOKENS;
  }

  return {
    amount: safeAmount,
    before,
    after,
    levelsGained
  };
}

// Send one clear level-up message for each new level. The setting controls
// whether the message goes to DMs or the channel where the reward happened.
async function sendLevelUpNotifications(discordUser, userData, xpResult, channel) {
  if (!discordUser || xpResult?.levelsGained < 1) {
    return;
  }

  for (let level = xpResult.before.level + 1; level <= xpResult.after.level; level += 1) {
    try {
      const destination = userData.dmLevelUp ? discordUser : channel;
      if (!destination?.send) {
        console.warn(`[Levels] No notification destination for level ${level}`);
        continue;
      }

      await destination.send(
        `**You leveled up to ${level} and received:**\n` +
        `**${LEVEL_UP_BELI.toLocaleString('en-US')}**<:money:1532532493578928178>\n` +
        `**${LEVEL_UP_RESET_TOKENS}**<:meatrbg:1532524176701657248>`
      );
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
  LEVEL_UP_RESET_TOKENS,
  getXpForNextLevel,
  getLevelProgress,
  addXp,
  sendLevelUpNotifications,
  formatXpReward
};