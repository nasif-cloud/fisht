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
  isKnockedOut,
  isTeamDefeated
} = require('../../utils/duel');

const ACCEPT_TIMEOUT_MS = 60000;
const ROUND_TIMEOUT_MS = 30000;
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

function buildCardSection(card) {
  return {
    type: 10,
    content: formatCardLine(card)
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

function buildPlayerComponents(duelId, player, selected) {
  const components = [];

  // A type-9 section is used only when the avatar accessory exists.
  // This keeps the username and avatar together without putting images
  // beside the individual cards
  if (player.avatarUrl) {
    components.push({
      type: 9,
      components: [{ type: 10, content: `## **${player.username}**\n` }],
      accessory: {
        type: 11,
        media: { url: player.avatarUrl },
        description: `${player.username}'s avatar`
      }
    });
  } else {
    components.push({
      type: 10,
      content: `## **${player.username}**\n`
    });
  }

  for (const card of player.team) {
    components.push(buildCardSection(card));
  }

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

function buildBattleComponents(state, logText) {
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
        { type: 14, divider: true, spacing: 1 },
        ...buildPlayerComponents(
          state.id,
          state.challenger,
          state.selections[state.challenger.id]
        ),
        { type: 14, divider: true, spacing: 1 },
        ...buildPlayerComponents(
          state.id,
          state.target,
          state.selections[state.target.id]
        ),
        { type: 14, divider: true, spacing: 1 },
        // Battle log text — the divider above already provides visual separation
        { type: 10, content: logText || 'Pick the card you want to attack with' }
      ]
    }
  ];
}

function buildBattlePayload(state) {
  // Discord limits all displayable text in a Components V2 message to
  // 4,000 characters. Trim the oldest logs first so current card state and
  // the latest combat events remain visible
  const visibleLogs = state.logs.slice(-12);
  let components = buildBattleComponents(state, visibleLogs.join('\n'));
  while (
    visibleLogs.length > 0 &&
    getDisplayableTextLength(components) > 3900
  ) {
    visibleLogs.shift();
    components = buildBattleComponents(state, visibleLogs.join('\n'));
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
  state.logs.push(text);
  if (state.logs.length > 12) state.logs.shift();
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
      `${rankEmojis[activeCard.rank] || ''} **${activeCard.name}** deals **${damage}<:punch:1534337550137954376>** to **${fallbackDefender.name}**`
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
    `${rankEmojis[attacker.rank] || ''} **${attacker.name}** deals **${challengerDamage}<:punch:1534337550137954376>** to **${defender.name}**`
  );
  addRoundLog(
    state,
    `${rankEmojis[defender.rank] || ''} **${defender.name}** deals **${targetDamage}<:punch:1534337550137954376>** to **${attacker.name}**`
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
    if (buildDuelTeam(challengerData).length !== 3) {
      return privateReply(
        interactionOrMessage,
        'You need a full 3-card team before starting a duel'
      );
    }
    const targetData = await User.findOne({ userId: target.id });
    if (buildDuelTeam(targetData).length !== 3) {
      return privateReply(
        interactionOrMessage,
        `${target.username} needs a full 3-card team before they can duel`
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

      if (challengerTeam.length !== 3 || targetTeam.length !== 3) {
        await response.edit({
          content: 'The duel could not start because both players need a full 3-card team',
          embeds: [],
          components: []
        });
        releaseUsers();
        return;
      }

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
        logs: []
      };

      await response.edit(buildBattlePayload(state));
      let roundCollector;

      const startRound = async () => {
        state.selections = {};
        await response.edit(buildBattlePayload(state));
        roundCollector = response.createMessageComponentCollector({
          time: ROUND_TIMEOUT_MS
        });

        roundCollector.on('collect', async pickInteraction => {
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
            state.selections[state.challenger.id] !== undefined &&
            state.selections[state.target.id] !== undefined
          ) {
            roundCollector.stop('both-selected');
          }
        });

        roundCollector.on('end', async (_collected, reason) => {
          if (finished) return;
          const result = resolveRound(state);
          if (result.ended) {
            const content = result.reason === 'no-actions'
              ? 'Duel ended with no winners'
              : result.reason === 'draw'
                ? 'The duel ended in a draw'
                : `**${result.winner.username} wins**`;
            await response.edit(buildEndPayload(content, state));
            releaseUsers();
            return;
          }

          await response.edit(buildBattlePayload(state));
          if (reason !== 'both-selected') {
            addRoundLog(state, '◇ The timer expired — the duel continues');
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