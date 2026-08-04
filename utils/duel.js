// ─────────────────────────────────────────────
// DUEL TEAM AND COMBAT HELPERS
// ─────────────────────────────────────────────

const { cards, resolveStat, safeRank, safeStat } = require('../data/cards');
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

// Assign HP/ATK/SPD exactly once each. The best assignment is selected by
// comparing each card's share of the strongest value for each stat, so a card
// that leads two stats receives the role where its advantage is strongest.
function assignRoles(team) {
  const result = team.map(card => ({ ...card }));
  if (result.length === 0) return result;

  const roles = ROLE_ORDER.slice(0, result.length);
  let best = null;

  function visit(index, usedRoles, assignment, score) {
    if (index >= result.length) {
      if (!best || score > best.score) {
        best = { assignment: [...assignment], score };
      }
      return;
    }

    for (const role of roles) {
      if (usedRoles.has(role)) continue;
      const stat = ROLE_STATS[role];
      const maximum = Math.max(...result.map(card => card[stat]), 1);
      const isStatLeader = result[index][stat] === maximum;
      // Prefer the actual stat leader for each role. The normalized value
      // breaks conflicts when one card leads multiple stats.
      const roleScore = (isStatLeader ? 1000 : 0) + result[index][stat] / maximum;
      usedRoles.add(role);
      assignment.push(role);
      visit(index + 1, usedRoles, assignment, score + roleScore);
      assignment.pop();
      usedRoles.delete(role);
    }
  }

  visit(0, new Set(), [], 0);
  result.forEach((card, index) => {
    card.role = best?.assignment[index] || roles[index] || 'HP';
  });
  return result;
}

function getDamageMultiplier(attackerRole, defenderRole) {
  return DAMAGE_MULTIPLIERS[attackerRole]?.[defenderRole] || 1;
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

function formatCardLine(card) {
  const health = Math.max(0, Math.round(card.health));
  return [
    `${formatRole(card)} **${card.name}** · Lv. ${card.mastery} M${card.mastery}`,
    `${buildProgressBar(health, card.maxHealth)} \`${health}/${card.maxHealth}\``,
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
  getDamageMultiplier,
  isKnockedOut,
  isTeamDefeated
};