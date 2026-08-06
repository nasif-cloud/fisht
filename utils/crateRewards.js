// ─────────────────────────────────────────────
// CRATE DROP REWARDS
// ─────────────────────────────────────────────
// Successful Battle, Manga, and Trivia challenges each get one independent
// chance to award a Crate. The caller saves the user after this helper runs.

const CRATE_DROP_CHANCE = 0.10;
const CRATE_FIELD = 'crates';

function tryAwardCrate(userData) {
  if (!userData || Math.random() >= CRATE_DROP_CHANCE) return false;

  userData[CRATE_FIELD] = (Number(userData[CRATE_FIELD]) || 0) + 1;
  return true;
}

module.exports = {
  CRATE_DROP_CHANCE,
  tryAwardCrate
};