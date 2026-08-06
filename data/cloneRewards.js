// ─────────────────────────────────────────────
// CLONE REWARD ODDS
// ─────────────────────────────────────────────
// Chest rewards use the original Clone table. Random Clone shop purchases use
// the same D/C/B/A distribution, plus the requested rare S and SS chances.

const CHEST_CLONE_ROLLS = [
  { rank: 'D', weight: 60 },
  { rank: 'C', weight: 30 },
  { rank: 'B', weight: 8 },
  { rank: 'A', weight: 1.95 },
  { rank: 'S', weight: 0.05 }
];

// Random Clone purchases keep the Chest odds, add a 0.05% SS chance and an
// additional 0.01% S chance, and take both additions from the D chance.
// This makes the final table total exactly 100%.
const RANDOM_CLONE_ROLLS = [
  { rank: 'D', weight: 59.94 },
  { rank: 'C', weight: 30 },
  { rank: 'B', weight: 8 },
  { rank: 'A', weight: 1.95 },
  { rank: 'S', weight: 0.06 },
  { rank: 'SS', weight: 0.05 }
];

function chooseWeightedClone(pool) {
  const totalWeight = pool.reduce((total, entry) => total + entry.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;

  for (const entry of pool) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.rank;
  }

  return pool[pool.length - 1].rank;
}

function rollCloneRewards(amount, pool = RANDOM_CLONE_ROLLS) {
  const rewards = {};

  for (let index = 0; index < amount; index += 1) {
    const rank = chooseWeightedClone(pool);
    rewards[rank] = (rewards[rank] || 0) + 1;
  }

  return rewards;
}

module.exports = {
  CHEST_CLONE_ROLLS,
  RANDOM_CLONE_ROLLS,
  chooseWeightedClone,
  rollCloneRewards
};