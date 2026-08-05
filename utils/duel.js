// ─────────────────────────────────────────────
// DUEL TEAM AND COMBAT HELPERS
// ─────────────────────────────────────────────

const {
  cards,
  rankEmojis,
  resolveStat,
  safeRank,
  safeStat,
  statRanges
} = require('../data/cards');
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

// Stat values are grouped before comparison so the larger HP range does not
// overpower the smaller ATK and SPD ranges.
const ROLE_STAT_STEPS = {
  health: 7,
  power: 2,
  speed: 1
};

// Return how far a card has progressed through its own rank range.
// Example: a 30 SPD card at the bottom of a 30-40 range scores low, while
// 389 HP in a 200-400 range scores near the top. This compares the card's
// position inside its rank instead of comparing raw HP, ATK, and SPD values.
function getRoleScore(card, role) {
  const stat = ROLE_STATS[role];
  const range = statRanges[card.rank]?.[stat];
  if (!range) return 0;

  const rawValue = Math.max(0, Number(card[stat]) || 0);
  const step = ROLE_STAT_STEPS[stat] || 1;
  const rangeSize = Math.max(range.max - range.min, 1);
  const clampedValue = Math.min(Math.max(rawValue, range.min), range.max);
  const steppedProgress = Math.floor(
    Math.max(0, clampedValue - range.min) / step
  ) * step;
  return steppedProgress / rangeSize;
}

// Assign HP/ATK/SPD exactly once each by maximizing each card's rank-relative
// role score. A card can be strongest in more than one role, so all possible
// one-to-one assignments are checked and the highest total is selected.
function assignRoles(team) {
  const result = team.map(card => ({ ...card }));
  if (result.length === 0) return result;

  const roles = ROLE_ORDER.slice(0, result.length);
  let best = null;

  function visit(index, usedCards, assignment, score) {
    if (index >= roles.length) {
      if (!best || score > best.score) {
        best = { assignment: [...assignment], score };
      }
      return;
    }

    const role = roles[index];
    for (let cardIndex = 0; cardIndex < result.length; cardIndex += 1) {
      if (usedCards.has(cardIndex)) continue;
      usedCards.add(cardIndex);
      assignment.push(cardIndex);
      visit(
        index + 1,
        usedCards,
        assignment,
        score + getRoleScore(result[cardIndex], role)
      );
      assignment.pop();
      usedCards.delete(cardIndex);
    }
  }

  visit(0, new Set(), [], 0);
  result.forEach(card => {
    card.role = null;
  });
  roles.forEach((role, roleIndex) => {
    const cardIndex = best?.assignment[roleIndex];
    if (cardIndex !== undefined) result[cardIndex].role = role;
  });

  // Safety fallback for an unusual empty assignment.
  result.forEach((card, index) => {
    if (!card.role) card.role = roles[index] || 'HP';
  });
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