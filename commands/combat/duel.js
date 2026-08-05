// ─────────────────────────────────────────────
// DUEL — player versus player card combat
// ─────────────────────────────────────────────

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const User = require('../../models/user');
const { rankEmojis } = require('../../data/cards');
const {
  buildDuelTeam,
  calculateDamage,
  formatCardLine,
  getAttackType,
  isKnockedOut,
  isTeamDefeated
} = require('../../utils/duel');
const { getLastDailyReset, updateQuestProgress } = require('../../utils/quests');
const { addXp, getLevelProgress } = require('../../utils/levels');

const ACCEPT_TIMEOUT_MS = 60000;
const ROUND_TIMEOUT_MS = 30000;
const DUEL_REWARD_XP = 30;
const DUEL_REWARD_BELI = 1000;
const MAX_MONTHLY_OPPONENT_DUELS = 3;
const activeUsers = new Set();

// Button emojis use Discord's structured emoji field so custom stat emojis
// render correctly instead of appearing as raw text in the button label
const ROLE_BUTTON_EMOJIS = {
  HP: { id: '1534326743459037244', name: 'Health' },
  ATK: { id: '1534326742678769684', name: 'Power' },
  SPD: { id: '1534326741693104168', name: 'Speed' }
};

function getUser(interactionOrMessage) {
  return interactionOrMessage.user || interactionOrMessage.author;
}

function getTarget(interactionOrMessage, args = []) {
  const mentioned = interactionOrMessage.mentions?.users?.first();
  if (mentioned) return mentioned;

  const id = args[0]?.replace(/[<@!>]/g, '');
  if (!/^\d+$/.test(id || '')) return null;
  return { id, username: id, bot: false };
}

function privateReply(interaction, content) {
  if (interaction.isChatInputCommand?.()) {
    return interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({
    content,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

function getAvatarUrl(user) {
  if (typeof user?.displayAvatarURL === 'function') {
    return user.displayAvatarURL({ extension: 'png', size: 64 });
  }
  if (typeof user?.avatarURL === 'function') {
    return user.avatarURL({ extension: 'png', size: 64 });
  }
  return null;
}

// Duel quests are updated only after the request is accepted or the duel has
// a winner. Reloading each user here avoids saving stale card/team data from
// the in-memory duel state over newer changes made elsewhere.
async function updateDuelQuest(userId, progressType) {
  try {
    let userData = await User.findOne({ userId });
    if (!userData) userData = new User({ userId });
    const changed = updateQuestProgress(userData, progressType, 1);
    // Save even when this particular quest is not currently assigned so a
    // newly-created daily quest set from ensureDailyQuests is persisted.
    await userData.save();
    return changed;
  } catch (error) {
    console.error(`[Duel] Failed to update ${progressType} quest for ${userId}:`, error.message);
    return false;
  }
}

async function recordDuelParticipation(state) {
  if (state.participationRecorded) return;
  state.participationRecorded = true;
  await Promise.all([
    updateDuelQuest(state.challenger.id, 'duel_participate'),
    updateDuelQuest(state.target.id, 'duel_participate')
  ]);
}

async function recordDuelWin(userId) {
  await updateDuelQuest(userId, 'duel_win');
}

function getMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function getDuelLevel(userData) {
  return getLevelProgress(userData?.xp).level;
}

function isOpponentInRewardRange(winnerLevel, opponentLevel) {
  return opponentLevel >= winnerLevel - 5 && opponentLevel <= winnerLevel + 30;
}

function getOpponentDuelCount(userData, opponentId, monthKey) {
  return (userData?.duelMonthlyOpponentCounts || [])
    .find(entry => entry.opponentId === opponentId && entry.monthKey === monthKey)
    ?.count || 0;
}

function incrementOpponentDuelCount(userData, opponentId, monthKey) {
  userData.duelMonthlyOpponentCounts = (userData.duelMonthlyOpponentCounts || [])
    .filter(entry => entry.monthKey === monthKey);
  let entry = userData.duelMonthlyOpponentCounts.find(item => item.opponentId === opponentId);
  if (!entry) {
    entry = { opponentId, monthKey, count: 0 };
    userData.duelMonthlyOpponentCounts.push(entry);
  }
  entry.count = Math.max(0, Number(entry.count) || 0) + 1;
  return entry.count;
}

async function recordAcceptedDuel(challengerData, targetData, challengerId, targetId) {
  try {
    const monthKey = getMonthKey();
    incrementOpponentDuelCount(challengerData, targetId, monthKey);
    incrementOpponentDuelCount(targetData, challengerId, monthKey);
    await Promise.all([challengerData.save(), targetData.save()]);
    return true;
  } catch (error) {
    // The duel itself remains available even if reward tracking has a
    // temporary database problem. The reward simply will not be eligible
    // until the monthly match count can be recorded successfully.
    console.error('[Duel] Failed to record monthly opponent count:', error.message);
    return false;
  }
}

async function awardDuelReward(state, winner) {
  try {
    if (!state.monthlyCountRecorded) {
      return { awarded: false, reason: 'monthly-count-unavailable' };
    }

    const winnerData = await User.findOne({ userId: winner.id });
    const opponentId = winner.id === state.challenger.id
      ? state.target.id
      : state.challenger.id;
    const opponentData = await User.findOne({ userId: opponentId });
    if (!winnerData || !opponentData) return { awarded: false, reason: 'missing-data' };

    const now = new Date();
    const lastDailyReset = getLastDailyReset(now);
    if (winnerData.lastDuelRewardAt && winnerData.lastDuelRewardAt >= lastDailyReset) {
      return { awarded: false, reason: 'daily-used' };
    }

    const monthKey = getMonthKey(now);
    const opponentDuelCount = getOpponentDuelCount(winnerData, opponentId, monthKey);
    if (opponentDuelCount > MAX_MONTHLY_OPPONENT_DUELS) {
      return { awarded: false, reason: 'monthly-limit' };
    }

    const winnerLevel = getDuelLevel(winnerData);
    const opponentLevel = getDuelLevel(opponentData);
    if (!isOpponentInRewardRange(winnerLevel, opponentLevel)) {
      return { awarded: false, reason: 'level-range' };
    }

    const xpResult = addXp(winnerData, DUEL_REWARD_XP);
    winnerData.balance = (Number(winnerData.balance) || 0) + DUEL_REWARD_BELI;
    winnerData.lastDuelRewardAt = now;
    await winnerData.save();

    return { awarded: true, xpResult };
  } catch (error) {
    console.error('[Duel] Reward failed:', error.message);
    return { awarded: false, reason: 'error' };
  }
}

function buildRequestPayload(challenger, target) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('Duel request')
        .setDescription(
          `Hey **${target.username}**, **${challenger.username}** wants to duel you`
        )
        .setFooter({ text: 'waiting for response' })
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: 'duel_accept',
            style: 2,
            label: 'Accept'
          },
          {
            type: 2,
            custom_id: 'duel_decline',
            style: 4,
            label: 'Decline'
          }
        ]
      }
    ],
    allowedMentions: { parse: [], repliedUser: false },
    fetchReply: true
  };
}

function buildCardSection(card, barSegments) {
  return {
    type: 10,
    content: formatCardLine(card, barSegments)
  };
}

// Components V2 does not have a normal margin component. A zero-width space
// gives Discord a real, visible blank line without adding extra text or
// accidentally creating several blank lines from trailing newlines.
function buildBlankSpace() {
  return {
    type: 10,
    content: '\u200b'
  };
}

function buildButtonRow(duelId, playerId, team, selected) {
  return {
    type: 1,
    components: team.map((card, index) => ({
      type: 2,
      custom_id: `duel_pick_${duelId}_${playerId}_${index}`,
      style: 2,
      // The role emoji makes the card's HP, PWR, or SPD role visible
      // before the player chooses a card
      emoji: ROLE_BUTTON_EMOJIS[card.role],
      label: card.name.slice(0, 80),
      disabled: selected !== undefined || isKnockedOut(card)
    }))
  };
}

function buildPlayerComponents(duelId, player, selected, barSegments) {
  const components = [];

  // A type-9 section is used only when the avatar accessory exists.
  // This keeps the username and avatar together without putting images
  // beside the individual cards
  if (player.avatarUrl) {
    components.push({
      type: 9,
      components: [{ type: 10, content: `## **${player.username}**` }],
      accessory: {
        type: 11,
        media: { url: player.avatarUrl },
        description: `${player.username}'s avatar`
      }
    });
  } else {
    components.push({
      type: 10,
      content: `## **${player.username}**`
    });
  }

  for (const card of player.team) {
    components.push(buildCardSection(card, barSegments));
  }

  // Keep the cards visually separate from their selection buttons.
  components.push(buildBlankSpace());
  components.push(buildButtonRow(duelId, player.id, player.team, selected));
  return components;
}

function getDisplayableTextLength(component) {
  if (!component || typeof component !== 'object') return 0;

  let length = 0;
  if (component.type === 10) length += component.content?.length || 0;
  if (component.type === 2) length += component.label?.length || 0;
  if (component.type === 11) length += component.description?.length || 0;

  for (const child of component.components || []) {
    length += getDisplayableTextLength(child);
  }
  if (component.accessory) {
    length += getDisplayableTextLength(component.accessory);
  }
  return length;
}

function buildBattleComponents(state, logText, barSegments = 5) {
  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          // The battle order is: users, separator, player one, cards,
          // buttons, separator, player two, cards, buttons, separator, logs
          content: `**${state.challenger.username}** VS **${state.target.username}**`
        },
        // One blank space between the users line and the first separator.
        buildBlankSpace(),
        { type: 14, divider: true, spacing: 1 },
        ...buildPlayerComponents(
          state.id,
          state.challenger,
          state.selections[state.challenger.id],
          barSegments
        ),
        { type: 14, divider: true, spacing: 1 },
        ...buildPlayerComponents(
          state.id,
          state.target,
          state.selections[state.target.id],
          barSegments
        ),
        { type: 14, divider: true, spacing: 1 },
        // One blank space between the final separator and the newest battle log.
        buildBlankSpace(),
        { type: 10, content: logText || 'Pick the card you want to attack with' }
      ]
    }
  ];
}

function buildBattlePayload(state) {
  // Only the newest round log is kept. Apart from matching the requested UI,
  // this prevents old combat history from making the Components V2 message
  // exceed Discord's 4,000-character display limit.
  const latestLog = state.latestLog || 'Pick the card you want to attack with';
  // Start with readable five-segment bars. If custom emoji text still pushes
  // the message near Discord's 4,000-character limit, progressively compact
  // only the bars, then trim the log as a final safety net.
  let components = buildBattleComponents(state, latestLog, 5);
  if (getDisplayableTextLength(components) > 3900) {
    components = buildBattleComponents(state, latestLog, 3);
  }
  if (getDisplayableTextLength(components) > 3900) {
    components = buildBattleComponents(state, latestLog.slice(-500), 3);
  }
  if (getDisplayableTextLength(components) > 3900) {
    components = buildBattleComponents(state, latestLog.slice(-250), 0);
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
    components,
    allowedMentions: {
      parse: [],
      repliedUser: false
    }
  };
}

function buildEndPayload(content, state) {
  return {
    flags: MessageFlags.IsComponentsV2,
    embeds: [],
    components: [
      {
        type: 17,
        components: [{ type: 10, content }]
      }
    ],
    allowedMentions: {
      parse: [],
      repliedUser: false
    }
  };
}

function getSelectedCard(player, selections) {
  const index = selections[player.id];
  if (!Number.isInteger(index)) return null;
  const card = player.team[index];
  return card && !isKnockedOut(card) ? card : null;
}

function getFirstLivingCard(player) {
  return player.team.find(card => !isKnockedOut(card)) || null;
}

function addRoundLog(state, text) {
  // Build the current round's log separately. It replaces the previous round
  // once combat resolves, so the message never becomes a transcript.
  state.roundLogs.push(text);
}

function resolveRound(state) {
  const attacker = getSelectedCard(state.challenger, state.selections);
  const defender = getSelectedCard(state.target, state.selections);

  if (!attacker && !defender) {
    return { ended: true, reason: 'no-actions' };
  }

  if (!attacker || !defender) {
    const idlePlayer = attacker ? state.target : state.challenger;
    const activeCard = attacker || defender;
    const defendingPlayer = attacker ? state.target : state.challenger;
    const fallbackDefender = getFirstLivingCard(defendingPlayer);

    addRoundLog(state, `◇ **${idlePlayer.username}** did nothing this round.`);

    if (!activeCard || !fallbackDefender) {
      return { ended: false };
    }

    const damage = calculateDamage(activeCard, fallbackDefender);
    fallbackDefender.health -= damage;
    addRoundLog(
      state,
      `${rankEmojis[activeCard.rank] || ''} **${activeCard.name}** deals ${getAttackType(activeCard.role, fallbackDefender.role)} **${damage}<:punch:1534337550137954376>** to **${fallbackDefender.name}**`
    );

    if (isTeamDefeated(state.challenger.team) && isTeamDefeated(state.target.team)) {
      return { ended: true, reason: 'draw' };
    }
    if (isTeamDefeated(state.target.team)) {
      return { ended: true, winner: state.challenger };
    }
    if (isTeamDefeated(state.challenger.team)) {
      return { ended: true, winner: state.target };
    }
    return { ended: false };
  }

  const challengerDamage = calculateDamage(attacker, defender);
  const targetDamage = calculateDamage(defender, attacker);
  const challengerHealthBefore = attacker.health;
  const targetHealthBefore = defender.health;

  attacker.health -= targetDamage;
  defender.health -= challengerDamage;

  addRoundLog(
    state,
      `${rankEmojis[attacker.rank] || ''} **${attacker.name}** deals ${getAttackType(attacker.role, defender.role)} **${challengerDamage}<:punch:1534337550137954376>** to **${defender.name}**`
  );
  addRoundLog(
    state,
      `${rankEmojis[defender.rank] || ''} **${defender.name}** deals ${getAttackType(defender.role, attacker.role)} **${targetDamage}<:punch:1534337550137954376>** to **${attacker.name}**`
  );

  // If both cards would be knocked out by the final exchange, the faster card
  // wins the exchange and survives with one HP. Equal speed removes both.
  if (isKnockedOut(attacker) && isKnockedOut(defender)) {
    const bothTeamsWouldEnd = isTeamDefeated(state.challenger.team) &&
      isTeamDefeated(state.target.team);
    if (bothTeamsWouldEnd && attacker.speed > defender.speed) {
      attacker.health = 1;
    } else if (bothTeamsWouldEnd && defender.speed > attacker.speed) {
      defender.health = 1;
    }
  }

  if (isTeamDefeated(state.challenger.team) && isTeamDefeated(state.target.team)) {
    return { ended: true, reason: 'draw' };
  }
  if (isTeamDefeated(state.target.team)) {
    return { ended: true, winner: state.challenger };
  }
  if (isTeamDefeated(state.challenger.team)) {
    return { ended: true, winner: state.target };
  }

  // Keep the variables intentionally read so future combat logging can use
  // the exact pre-exchange values without changing the combat rules.
  void challengerHealthBefore;
  void targetHealthBefore;
  return { ended: false };
}

function parsePickId(customId) {
  const match = customId.match(/^duel_pick_(\d+)_([0-9]+)_(\d+)$/);
  if (!match) return null;
  return {
    duelId: match[1],
    playerId: match[2],
    cardIndex: Number(match[3])
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Challenge another player to a card duel')
    .addUserOption(option =>
      option
        .setName('opponent')
        .setDescription('The player you want to challenge')
        .setRequired(true)
    ),

  name: 'duel',
  aliases: [],

  async execute(interactionOrMessage, args = []) {
    const challenger = getUser(interactionOrMessage);
    const target = interactionOrMessage.isChatInputCommand?.()
      ? interactionOrMessage.options.getUser('opponent')
      : getTarget(interactionOrMessage, args);

    if (!target) {
      return privateReply(interactionOrMessage, 'Please mention a player to duel');
    }
    if (target.id === challenger.id) {
      return privateReply(interactionOrMessage, 'You cannot duel yourself');
    }
    if (target.bot) {
      return privateReply(interactionOrMessage, 'You cannot duel a bot');
    }
    if (activeUsers.has(challenger.id) || activeUsers.has(target.id)) {
      return privateReply(interactionOrMessage, 'One of these players is already in a duel');
    }

    const challengerData = await User.findOne({ userId: challenger.id });
    if (buildDuelTeam(challengerData).length === 0) {
      return privateReply(
        interactionOrMessage,
        'You need at least 1 card in your team before starting a duel'
      );
    }
    const targetData = await User.findOne({ userId: target.id });
    if (buildDuelTeam(targetData).length === 0) {
      return privateReply(
        interactionOrMessage,
        `${target.username} needs at least 1 card in their team before they can duel`
      );
    }

    activeUsers.add(challenger.id);
    activeUsers.add(target.id);

    const payload = buildRequestPayload(challenger, target);
    let response;
    if (interactionOrMessage.isChatInputCommand?.()) {
      response = await interactionOrMessage.reply(payload);
    } else {
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    let accepted = false;
    let finished = false;
    const releaseUsers = () => {
      if (finished) return;
      finished = true;
      activeUsers.delete(challenger.id);
      activeUsers.delete(target.id);
    };

    const requestCollector = response.createMessageComponentCollector({
      time: ACCEPT_TIMEOUT_MS
    });

    requestCollector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== target.id) {
        return componentInteraction.reply({
          content: 'Only the challenged player can respond to this duel',
          flags: MessageFlags.Ephemeral
        });
      }

      if (componentInteraction.customId === 'duel_decline') {
        await componentInteraction.update({
          content: `**${target.username}** declined the duel`,
          embeds: [],
          components: []
        });
        requestCollector.stop('declined');
        releaseUsers();
        return;
      }

      if (componentInteraction.customId !== 'duel_accept') return;

      accepted = true;
      await componentInteraction.deferUpdate();
      requestCollector.stop('accepted');

      const freshChallenger = await User.findOne({ userId: challenger.id });
      const freshTarget = await User.findOne({ userId: target.id });
      const challengerTeam = buildDuelTeam(freshChallenger);
      const targetTeam = buildDuelTeam(freshTarget);

      if (challengerTeam.length === 0 || targetTeam.length === 0) {
        await response.edit({
          content: 'The duel could not start because both players need at least 1 card in their team',
          embeds: [],
          components: []
        });
        releaseUsers();
        return;
      }

      const monthlyCountRecorded = await recordAcceptedDuel(
        freshChallenger,
        freshTarget,
        challenger.id,
        target.id
      );

      const state = {
        id: response.id,
        challenger: {
          id: challenger.id,
          username: challenger.username,
          avatarUrl: getAvatarUrl(challenger),
          team: challengerTeam
        },
        target: {
          id: target.id,
          username: target.username,
          avatarUrl: getAvatarUrl(target),
          team: targetTeam
        },
        selections: {},
        latestLog: '',
        roundLogs: [],
        participationRecorded: false,
        monthlyCountRecorded
      };

      await recordDuelParticipation(state);
      await response.edit(buildBattlePayload(state));
      let roundCollector;

      const startRound = async () => {
        state.selections = {};
        state.roundLogs = [];
        await response.edit(buildBattlePayload(state));

        roundCollector = response.createMessageComponentCollector({
          time: ROUND_TIMEOUT_MS
        });
        let roundSettled = false;
        // Discord may deliver both button clicks before either async handler
        // finishes. Serialize the entire handler, not only response.edit(),
        // so the collector cannot advance while the second selection is still
        // being acknowledged.
        let selectionQueue = Promise.resolve();

        roundCollector.on('collect', pickInteraction => {
          selectionQueue = selectionQueue.then(async () => {
            if (roundSettled) return;

            const pick = parsePickId(pickInteraction.customId);
            if (!pick || pick.duelId !== state.id) return;
            if (![state.challenger.id, state.target.id].includes(pick.playerId)) {
              return pickInteraction.reply({
                content: 'This is not your duel',
                flags: MessageFlags.Ephemeral
              });
            }
            if (pickInteraction.user.id !== pick.playerId) {
              return pickInteraction.reply({
                content: 'You can only choose your own card',
                flags: MessageFlags.Ephemeral
              });
            }
            if (state.selections[pick.playerId] !== undefined) return;

            const player = pick.playerId === state.challenger.id
              ? state.challenger
              : state.target;
            if (!player.team[pick.cardIndex] || isKnockedOut(player.team[pick.cardIndex])) {
              return pickInteraction.reply({
                content: 'That card is knocked out',
                flags: MessageFlags.Ephemeral
              });
            }

            state.selections[pick.playerId] = pick.cardIndex;
            await pickInteraction.deferUpdate();
            await response.edit(buildBattlePayload(state));

            if (
              !roundSettled &&
              state.selections[state.challenger.id] !== undefined &&
              state.selections[state.target.id] !== undefined
            ) {
              roundSettled = true;
              roundCollector.stop('both-selected');
            }
          });

          return selectionQueue;
        });

        roundCollector.on('end', async (_collected, reason) => {
          if (finished || roundSettled && reason !== 'both-selected') return;
          roundSettled = true;

          // Wait for both queued selection handlers before resolving combat.
          // Otherwise the end handler can PATCH the message while the second
          // player's interaction is still being acknowledged.
          await selectionQueue.catch(() => {});

          const result = resolveRound(state);
          if (!result.ended && reason !== 'both-selected') {
            addRoundLog(state, '◇ The timer expired — the duel continues');
          }
          // Replace the previous round's display with this round's newest log.
          state.latestLog = state.roundLogs.join('\n');
          if (result.ended) {
              let rewardResult = null;
              if (result.winner) {
                await recordDuelWin(result.winner.id);
                rewardResult = await awardDuelReward(state, result.winner);
              }
              let content = result.reason === 'no-actions'
                ? 'Duel ended with no winners'
                : result.reason === 'draw'
                  ? 'The duel ended in a draw'
                  : `**${result.winner.username} wins**`;
              if (rewardResult?.awarded) {
                content += `\nReward: **${DUEL_REWARD_XP} XP** and **${DUEL_REWARD_BELI.toLocaleString('en-US')}**<:money:1532532493578928178> Beli`;
              }
            await response.edit(buildEndPayload(content, state));
            releaseUsers();
            return;
          }

          await startRound();
        });
      };

      await startRound();
    });

    requestCollector.on('end', async (_collected, reason) => {
      if (accepted || finished || reason === 'declined') return;
      // README.md requires expired button embeds to keep the embed and
      // replace its original footer with exactly "expired"
      await response.edit({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle('Duel request')
            .setDescription(
              `Hey **${target.username}**, **${challenger.username}** wants to duel you`
            )
            .setFooter({ text: 'expired' })
        ],
        components: []
      }).catch(() => {});
      releaseUsers();
    });
  }
};