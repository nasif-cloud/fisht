// ─────────────────────────────────────────────
// LEVEL AND XP HELPERS
// ─────────────────────────────────────────────
// XP requirements start at 150 XP for level 1 → level 2, then increase
// by 5 XP for each subsequent level.

const XP_PER_LEVEL_BASE = 150;
const XP_PER_LEVEL_INCREMENT = 5;
const LEVEL_UP_BELI = 10_000;
const LEVEL_UP_RESET_TOKENS = 3;

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

// Send one clear DM for each new level. Failed DMs are ignored because a
// player's level and rewards must still save when their DMs are closed.
async function sendLevelUpNotifications(discordUser, userData, xpResult) {
  if (!discordUser || userData.dmLevelUp === false || xpResult.levelsGained < 1) {
    return;
  }

  for (let level = xpResult.before.level + 1; level <= xpResult.after.level; level += 1) {
    try {
      await discordUser.send(
        `**You leveled up to ${level} and received:**\n` +
        `**${LEVEL_UP_BELI.toLocaleString('en-US')}** Beli\n` +
        `**${LEVEL_UP_RESET_TOKENS}** reset tokens`
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