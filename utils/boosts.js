// ─────────────────────────────────────────────
// BOOST CALCULATOR
// ─────────────────────────────────────────────
// Computes the stat boosts applied to a card a player owns.
// Two independent boost sources stack on top of each other:
//
//   • Copies — each copy you own adds 0.1% to every stat.
//              So 5 copies = 5 × 0.1% = 0.5% total.
//   • Shiny  — a shiny card gives an extra flat 3% to every stat.
//
// Both boosts are calculated and rounded up (Math.ceil) SEPARATELY,
// then added together. "Rounded up" means even a 0.05 hp boost becomes +1.
//
// Example (60 base power, 3 copies, shiny):
//   Copy boost:  Math.ceil(60 × 0.003) = Math.ceil(0.18) = 1
//   Shiny boost: Math.ceil(60 × 0.030) = Math.ceil(1.80) = 2
//   Final power: 60 + 1 + 2 = 63

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
  // Copies boost: 0.1% per copy = multiply copies by 0.001
  const copyPct  = copies * 0.001;

  // Shiny boost: flat 3% = 0.03 (or 0 if not shiny)
  const shinyPct = isShiny ? 0.03 : 0;

  // Round each boost up independently using Math.ceil
  const copyBoost = {
    health: Math.ceil(baseHealth * copyPct),
    power:  Math.ceil(basePower  * copyPct),
    speed:  Math.ceil(baseSpeed  * copyPct)
  };

  const shinyBoost = {
    health: isShiny ? Math.ceil(baseHealth * shinyPct) : 0,
    power:  isShiny ? Math.ceil(basePower  * shinyPct) : 0,
    speed:  isShiny ? Math.ceil(baseSpeed  * shinyPct) : 0
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
