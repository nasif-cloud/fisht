// ─────────────────────────────────────────────
// DUEL TEAM AND COMBAT HELPERS
// ─────────────────────────────────────────────

const { cards, rankEmojis, resolveStat, safeRank, safeStat } = require('../data/cards');
const { computeBoosts } = require('./boosts');
const { buildProgressBar } = require('./quests');

const ROLE_ORDER = ['HP', 'ATK', 'SPD'];
const ROLE_STATS = {
  HP: 'health',
  ATK: 'power',
  SPD: 'speed'
};

const ROLE_EMOJIS = {
  HP: '<:Health:1534326743459037244>',
  ATK: '<:Power:1534326742678769684>',
  SPD: '<:Speed:1534326741693104168>'
};

const DAMAGE_MULTIPLIERS = {
  HP: { HP: 1, ATK: 2, SPD: 0.5 },
  ATK: { HP: 0.5, ATK: 1, SPD: 2 },
  SPD: { HP: 2, ATK: 0.5, SPD: 1 }
};

function getCardData(card, mastery = 1) {
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card;
}

function buildDuelTeam(userData) {
  const copiesByName = new Map(
    (userData?.cardCopies || [])
      .filter(entry => Number(entry.amount) > 0)
      .map(entry => [entry.cardName, entry])
  );

  const teamNames = Array.isArray(userData?.teamCards)
    ? userData.teamCards
    : [];

  const team = [];
  for (const cardName of teamNames) {
    if (team.some(entry => entry.name === cardName)) continue;

    const card = cards.find(entry => entry.name === cardName);
    const owned = copiesByName.get(cardName);
    if (!card || !owned) continue;

    const mastery = Math.min(3, Math.max(1, Number(owned.mastery) || 1));
    const cardData = getCardData(card, mastery);
    const rank = safeRank(cardData.rank || card.rank);
    const baseHealth = resolveStat(
      rank,
      'health',
      safeStat(cardData.health),
      card.name,
      mastery
    );
    const basePower = resolveStat(
      rank,
      'power',
      safeStat(cardData.power),
      card.name,
      mastery
    );
    const baseSpeed = resolveStat(
      rank,
      'speed',
      safeStat(cardData.speed),
      card.name,
      mastery
    );
    const boosted = computeBoosts(
      baseHealth,
      basePower,
      baseSpeed,
      Number(owned.amount) || 1,
      owned.shiny ?? false
    );

    team.push({
      name: card.name,
      title: cardData.title || card.title || card.name,
      rank,
      image: cardData.image || card.image,
      mastery,
      copies: Number(owned.amount) || 1,
      isShiny: owned.shiny ?? false,
      maxHealth: Math.max(1, boosted.health),
      health: Math.max(1, boosted.health),
      power: Math.max(0, boosted.power),
      speed: Math.max(0, boosted.speed),
      role: null
    });
  }

  return assignRoles(team);
}

// The three stats use different numeric scales: health can reach 700, power
// can reach 125, and speed can reach 60. Comparing raw values or comparing
// each stat only to the team's maximum makes a card such as 71 power / 29
// speed look equally strong in both categories.
const ROLE_STAT_CEILINGS = {
  health: 700,
  power: 125,
  speed: 60
};

// Assign HP/ATK/SPD exactly once each.
//
// Role meaning is intentionally deterministic:
//   1. The strongest power card is ATK
//   2. The strongest health card among the remaining cards is HP
//   3. The remaining card is SPD
//
// This prevents a card with clearly higher power (for example 71 power and
// 29 speed) from being labelled SPD because another card contested a role in
// the old weighted assignment.
function assignRoles(team) {
  const result = team.map(card => ({ ...card }));
  if (result.length === 0) return result;

  const roles = ROLE_ORDER.slice(0, result.length);
  const unassigned = new Set(result.map((_, index) => index));

  function pickHighest(stat) {
    let bestIndex = null;
    for (const index of unassigned) {
      if (
        bestIndex === null ||
        (Number(result[index][stat]) || 0) > (Number(result[bestIndex][stat]) || 0)
      ) {
        bestIndex = index;
      }
    }
    if (bestIndex !== null) unassigned.delete(bestIndex);
    return bestIndex;
  }

  // ATK always belongs to the card with the highest power.
  if (roles.includes('ATK')) {
    const attackIndex = pickHighest('power');
    if (attackIndex !== null) result[attackIndex].role = 'ATK';
  }

  // HP is assigned from the cards still available after ATK.
  if (roles.includes('HP')) {
    const healthIndex = pickHighest('health');
    if (healthIndex !== null) result[healthIndex].role = 'HP';
  }

  // With a three-card team this is the last unassigned card. The fallback
  // also keeps two-card or one-card teams valid if they are ever rendered.
  if (roles.includes('SPD')) {
    const speedIndex = pickHighest('speed');
    if (speedIndex !== null) result[speedIndex].role = 'SPD';
  }

  // Safety fallback for any unusual team shape.
  for (const index of unassigned) {
    result[index].role = roles[index] || 'HP';
  }
  return result;
}

function getDamageMultiplier(attackerRole, defenderRole) {
  return DAMAGE_MULTIPLIERS[attackerRole]?.[defenderRole] || 1;
}

function getAttackType(attackerRole, defenderRole) {
  const multiplier = getDamageMultiplier(attackerRole, defenderRole);
  if (multiplier > 1) return '`+`';
  if (multiplier < 1) return '`-`';
  return '`=`';
}

function calculateDamage(attacker, defender) {
  return Math.max(
    1,
    Math.round(attacker.power * getDamageMultiplier(attacker.role, defender.role))
  );
}

function isKnockedOut(card) {
  return card.health <= 0;
}

function isTeamDefeated(team) {
  return team.every(isKnockedOut);
}

function formatRole(card) {
  return `${ROLE_EMOJIS[card.role] || ''} ${card.role}`;
}

function formatCardLine(card, barSegments = 5) {
  const health = Math.max(0, Math.round(card.health));
  const rankEmoji = rankEmojis[card.rank] || '';
  const cardLabel = rankEmoji
    ? `${rankEmoji} **${card.name}**`
    : `**${card.name}**`;
  const level = Math.floor(Math.max(0, Number(card.copies) || 0) / 10);
  const progress = barSegments > 0
    ? `${buildProgressBar(health, card.maxHealth, barSegments)} `
    : '';

  return [
    `${cardLabel} · Lv. ${level}`,
    `${progress}\`${health}/${card.maxHealth}\``,
    `<:Health:1534326743459037244> ${health}/${card.maxHealth}  |  <:Power:1534326742678769684> ${card.power}  |  <:Speed:1534326741693104168> ${card.speed}`
  ].join('\n');
}

module.exports = {
  DAMAGE_MULTIPLIERS,
  ROLE_EMOJIS,
  buildDuelTeam,
  calculateDamage,
  formatCardLine,
  formatRole,
  getAttackType,
  getDamageMultiplier,
  assignRoles,
  isKnockedOut,
  isTeamDefeated
};