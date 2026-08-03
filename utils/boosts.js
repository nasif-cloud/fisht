// ─────────────────────────────────────────────
// BOOST CALCULATOR
// ─────────────────────────────────────────────
// Computes the stat boosts applied to a card a player owns.
// Two independent boost sources stack on top of each other:
//
//   • Copies — each copy adds 0.3% to every stat.
//              So 10 copies = 10 × 0.3% = 3% total.
//   • Shiny  — a shiny card gives an extra flat 30% to every stat.
//
// ROUNDING RULES:
//   Power / Speed — Math.ceil (round up to the nearest whole number).
//                   Even a tiny boost like 0.1 becomes +1.
//   Health        — must always stay a multiple of 5.
//                   The raw boost is only applied once it reaches 2.5 or above;
//                   if it does, it is rounded UP to the next multiple of 5.
//                   If the raw boost is below 2.5, no health boost is applied.
//
//   Example — 30 base power, 5 copies, shiny:
//     Copy   power boost: Math.ceil(30 × 0.015) = Math.ceil(0.45) = 1
//     Shiny  power boost: Math.ceil(30 × 0.30)  = Math.ceil(9.0)  = 9
//     Final power: 30 + 1 + 9 = 40
//
//   Example — 100 base health, 10 copies, not shiny:
//     Copy raw health boost: 100 × 0.03 = 3.0  → 3.0 >= 2.5 → ceil(3.0 / 5) * 5 = 5
//     Final health: 100 + 5 = 105
//
//   Example — 100 base health, 2 copies, not shiny:
//     Copy raw health boost: 100 × 0.006 = 0.6  → 0.6 < 2.5 → +0 (no boost)
//     Final health: 100

/**
 * Round a health boost to the nearest multiple of 5.
 * Returns 0 if the raw boost is below 2.5 (the halfway point to 5).
 *
 * @param {number} raw  The unrounded health boost
 * @returns {number}    Boost rounded up to a multiple of 5, or 0
 */
function roundHealthBoost(raw) {
  // Only apply a health boost once it reaches 2.5 — the halfway point between 0 and 5.
  // This keeps health values on the 5-times-table they start on.
  if (raw < 2.5) return 0;
  return Math.ceil(raw / 5) * 5;
}

/**
 * Compute boosted stats for an owned card.
 *
 * @param {number}  baseHealth  Base health stat (before any boosts)
 * @param {number}  basePower   Base power stat
 * @param {number}  baseSpeed   Base speed stat
 * @param {number}  copies      Total copies the player owns (always >= 1)
 * @param {boolean} isShiny     Whether the player's copy of this card is shiny
 *
 * @returns {{
 *   health:     number,   // Final boosted health
 *   power:      number,   // Final boosted power
 *   speed:      number,   // Final boosted speed
 *   copyBoost:  { health: number, power: number, speed: number },
 *   shinyBoost: { health: number, power: number, speed: number }
 * }}
 */
function computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny) {
  // Copies boost: 0.3% per copy
  const copyPct  = copies * 0.003;

  // Shiny boost: 30% flat (or 0 if not shiny)
  const shinyPct = isShiny ? 0.30 : 0;

  // --- COPY BOOSTS ---
  // Health uses the multiple-of-5 rounding rule; power and speed use Math.ceil
  const copyBoost = {
    health: roundHealthBoost(baseHealth * copyPct),
    power:  Math.ceil(basePower  * copyPct),
    speed:  Math.ceil(baseSpeed  * copyPct)
  };

  // --- SHINY BOOSTS ---
  const shinyBoost = {
    health: isShiny ? roundHealthBoost(baseHealth * shinyPct) : 0,
    power:  isShiny ? Math.ceil(basePower  * shinyPct)        : 0,
    speed:  isShiny ? Math.ceil(baseSpeed  * shinyPct)        : 0
  };

  return {
    // Combined final stats
    health:     baseHealth + copyBoost.health + shinyBoost.health,
    power:      basePower  + copyBoost.power  + shinyBoost.power,
    speed:      baseSpeed  + copyBoost.speed  + shinyBoost.speed,
    // Kept separately so the boosts button can show the breakdown
    copyBoost,
    shinyBoost
  };
}

module.exports = { computeBoosts };
