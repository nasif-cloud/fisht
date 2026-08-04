// ─────────────────────────────────────────────
// PITY SYSTEM
// ─────────────────────────────────────────────
// Pity progress survives daily pull-window resets and is advanced only after
// a successful card pull. The highest eligible guarantee wins when thresholds
// overlap.

const { buildProgressBar } = require('./quests');
const { rankEmojis } = require('../data/cards');

const PITY_THRESHOLDS = Object.freeze({
  S: 250,
  SS: 800,
  UR: 2500
});

const PITY_FIELDS = Object.freeze({
  S: 'pityS',
  SS: 'pitySS',
  UR: 'pityUR'
});

const GUARANTEE_PRIORITY = ['UR', 'SS', 'S'];

function getPityValue(userData, rank) {
  return Math.max(0, Number(userData?.[PITY_FIELDS[rank]]) || 0);
}

function getPityProgress(userData) {
  return {
    S: getPityValue(userData, 'S'),
    SS: getPityValue(userData, 'SS'),
    UR: getPityValue(userData, 'UR')
  };
}

// Preview the result of one successful pull without mutating the user.
function previewPityPull(userData) {
  const current = getPityProgress(userData);
  const next = {
    S: current.S + 1,
    SS: current.SS + 1,
    UR: current.UR + 1
  };

  const guaranteedRank = GUARANTEE_PRIORITY.find(rank =>
    next[rank] >= PITY_THRESHOLDS[rank]
  ) || null;

  return { current, next, guaranteedRank };
}

function applyPityPull(userData, preview = previewPityPull(userData)) {
  if (preview.guaranteedRank) {
    // A higher guarantee supersedes lower guarantees on the same pull.
    // Preserve progress toward higher tiers so the S pity cannot prevent
    // the eventual SS and UR guarantees.
    const resetRanks = preview.guaranteedRank === 'UR'
      ? ['S', 'SS', 'UR']
      : preview.guaranteedRank === 'SS'
        ? ['S', 'SS']
        : ['S'];

    for (const rank of resetRanks) {
      userData[PITY_FIELDS[rank]] = 0;
    }
    for (const rank of Object.keys(PITY_FIELDS)) {
      if (!resetRanks.includes(rank)) {
        userData[PITY_FIELDS[rank]] = preview.next[rank];
      }
    }
  } else {
    userData.pityS = preview.next.S;
    userData.pitySS = preview.next.SS;
    userData.pityUR = preview.next.UR;
  }

  return preview.guaranteedRank;
}

function formatPityLine(rank, userData) {
  const progress = Math.min(getPityValue(userData, rank), PITY_THRESHOLDS[rank]);
  const emoji = rankEmojis[rank] || '';
  return `${emoji} **${rank} rank** \`${progress}/${PITY_THRESHOLDS[rank]}\` ${buildProgressBar(progress, PITY_THRESHOLDS[rank], 9)}`;
}

module.exports = {
  PITY_THRESHOLDS,
  PITY_FIELDS,
  getPityProgress,
  previewPityPull,
  applyPityPull,
  formatPityLine
};