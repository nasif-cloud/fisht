// ─────────────────────────────────────────────
// BATTLE — player versus a randomly selected AI opponent
// ─────────────────────────────────────────────

const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const User = require('../../models/user');
const {
  buildDuelTeam,
  isKnockedOut
} = require('../../utils/duel');
const {
  activeUsers,
  buildBattlePayload,
  buildEndPayload,
  getAvatarUrl,
  resolveRound
} = require('./duel');
const {
  addXp,
  sendLevelUpNotifications
} = require('../../utils/levels');
const { getLevelProgress } = require('../../utils/levels');

const ROUND_TIMEOUT_MS = 30_000;
const BATTLE_COOLDOWN_MS = 30 * 60 * 1000;
const BATTLE_REWARD_XP = 10;
const BATTLE_REWARD_BELI = 200;

function getUser(interactionOrMessage) {
  return interactionOrMessage.user || interactionOrMessage.author;
}

function isSlash(interactionOrMessage) {
  return interactionOrMessage.isChatInputCommand?.();
}

function reply(interactionOrMessage, content) {
  if (isSlash(interactionOrMessage)) {
    return interactionOrMessage.reply({
      content,
      flags: MessageFlags.Ephemeral
    });
  }

  return interactionOrMessage.channel.send({
    content,
    allowedMentions: { parse: [], repliedUser: false }
  });
}

function formatCooldown(ms) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getLevel(userData) {
  return getLevelProgress(userData?.xp).level;
}

function parsePickId(customId) {
  const match = customId.match(/^battle_pick_(\d+)_([0-9]+)_(\d+)$/);
  if (!match) return null;

  return {
    battleId: match[1],
    playerId: match[2],
    cardIndex: Number(match[3])
  };
}

function getRandomLivingIndex(team) {
  const livingIndexes = team
    .map((card, index) => (isKnockedOut(card) ? null : index))
    .filter(index => index !== null);

  if (livingIndexes.length === 0) return null;
  return livingIndexes[Math.floor(Math.random() * livingIndexes.length)];
}

async function findOpponent(guild, playerId, playerLevel) {
  const savedUsers = await User.find({ userId: { $ne: playerId } });
  const candidates = shuffle(savedUsers).filter(candidate => {
    const candidateLevel = getLevel(candidate);
    return Math.abs(candidateLevel - playerLevel) <= 5 &&
      buildDuelTeam(candidate).length > 0;
  });

  // Only use users who are actually in this server, so their saved team and
  // profile picture represent a real opponent the player can recognize.
  for (const candidate of candidates) {
    try {
      const member = await guild.members.fetch(candidate.userId);
      if (member?.user?.bot) continue;

      const team = buildDuelTeam(candidate);
      if (team.length > 0) {
        return { data: candidate, member, team };
      }
    } catch {
      // A database profile may belong to a user who left this guild.
    }
  }

  return null;
}

async function awardBattleReward(playerId) {
  const userData = await User.findOne({ userId: playerId });
  if (!userData) return null;

  const xpResult = addXp(userData, BATTLE_REWARD_XP);
  userData.balance = (Number(userData.balance) || 0) + BATTLE_REWARD_BELI;
  await userData.save();
  return { userData, xpResult };
}

function getPlayerSelection(state) {
  return state.selections[state.challenger.id];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Battle a random player near your level'),

  name: 'battle',
  aliases: [],

  async execute(interactionOrMessage) {
    const player = getUser(interactionOrMessage);
    const guild = interactionOrMessage.guild;

    if (!guild) {
      return reply(interactionOrMessage, 'Battle can only be played in a server');
    }

    let playerData = await User.findOne({ userId: player.id });
    if (!playerData) playerData = new User({ userId: player.id });

    if (playerData.lastBattleTime) {
      const remaining = BATTLE_COOLDOWN_MS -
        (Date.now() - playerData.lastBattleTime.getTime());
      if (remaining > 0) {
        return reply(
          interactionOrMessage,
          `You're on cooldown\nAvailable in: \`${formatCooldown(remaining)}\``
        );
      }
    }

    const playerTeam = buildDuelTeam(playerData);
    if (playerTeam.length === 0) {
      return reply(
        interactionOrMessage,
        'You need at least 1 card in your team before starting a battle'
      );
    }

    if (activeUsers.has(player.id)) {
      return reply(interactionOrMessage, 'You are already in a duel');
    }

    activeUsers.add(player.id);

    try {
      const playerLevel = getLevel(playerData);
      const opponent = await findOpponent(guild, player.id, playerLevel);

      if (!opponent) {
        activeUsers.delete(player.id);
        return reply(
          interactionOrMessage,
          'No player with a team was found within 5 levels of you'
        );
      }

      // Stamp the rolling cooldown before sending the battle message so a
      // second command cannot start while the first one is being prepared.
      playerData.lastBattleTime = new Date();
      await playerData.save();

      const opponentUser = opponent.member.user;
      const state = {
        id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
        challenger: {
          id: player.id,
          username: player.username,
          avatarUrl: getAvatarUrl(player),
          team: playerTeam
        },
        target: {
          id: opponentUser.id,
          username: opponentUser.username,
          avatarUrl: getAvatarUrl(opponentUser),
          team: opponent.team
        },
        selections: {},
        latestLog: ''
      };
      const renderOptions = {
        botPlayerId: state.target.id,
        commandPrefix: 'battle',
        topPlayerId: state.target.id
      };

      const payload = buildBattlePayload(state, renderOptions);
      let response;
      if (isSlash(interactionOrMessage)) {
        response = await interactionOrMessage.reply({
          ...payload,
          fetchReply: true
        });
      } else {
        response = await interactionOrMessage.channel.send(payload);
      }

      let finished = false;
      let roundCollector;

      const releasePlayer = () => {
        if (finished) return;
        finished = true;
        activeUsers.delete(player.id);
      };

      const finishBattle = async result => {
        if (result.winner?.id === state.challenger.id) {
          const reward = await awardBattleReward(player.id);
          const xpResult = reward?.xpResult;
          let content =
            `**${state.challenger.username} wins**\n` +
            `Reward: **${BATTLE_REWARD_XP} XP** and **${BATTLE_REWARD_BELI.toLocaleString('en-US')}**<:SilverCoin:1534757841867374782> Beli`;
          if (xpResult?.levelsGained > 0) {
            content += `\nYou reached level **${xpResult.after.level}**`;
          }
          const resultMessage = await response.edit(buildEndPayload(content, state));
          if (reward) {
            await sendLevelUpNotifications(
              player,
              reward.userData,
              reward.xpResult,
              interactionOrMessage.channel,
              resultMessage
            );
          }
        } else if (result.reason === 'draw') {
          await response.edit(buildEndPayload('The battle ended in a draw', state));
        } else {
          await response.edit(
            buildEndPayload(`**${state.target.username} wins**`, state)
          );
        }
        releasePlayer();
      };

      const startRound = async () => {
        if (finished) return;

        state.selections = {};
        state.roundLogs = [];
        const botIndex = getRandomLivingIndex(state.target.team);
        if (botIndex === null) {
          await finishBattle({ ended: true, winner: state.challenger });
          return;
        }
        state.selections[state.target.id] = botIndex;
        await response.edit(buildBattlePayload(state, renderOptions));

        roundCollector = response.createMessageComponentCollector({
          time: ROUND_TIMEOUT_MS
        });
        let roundSettled = false;
        let selectionQueue = Promise.resolve();

        roundCollector.on('collect', pickInteraction => {
          selectionQueue = selectionQueue.then(async () => {
            if (roundSettled || pickInteraction.user.id !== player.id) {
              if (pickInteraction.user.id !== player.id) {
                await pickInteraction.reply({
                  content: 'You can only choose your own card',
                  flags: MessageFlags.Ephemeral
                });
              }
              return;
            }

            const pick = parsePickId(pickInteraction.customId);
            if (!pick || pick.battleId !== state.id || pick.playerId !== player.id) {
              return;
            }
            if (getPlayerSelection(state) !== undefined) return;

            const card = state.challenger.team[pick.cardIndex];
            if (!card || isKnockedOut(card)) {
              return pickInteraction.reply({
                content: 'That card is knocked out',
                flags: MessageFlags.Ephemeral
              });
            }

            state.selections[player.id] = pick.cardIndex;
            await pickInteraction.deferUpdate();
            await response.edit(buildBattlePayload(state, renderOptions));
            roundSettled = true;
            roundCollector.stop('selected');
          });

          return selectionQueue;
        });

        roundCollector.on('end', async (_collected, reason) => {
          if (finished) return;
          roundSettled = true;
          await selectionQueue.catch(() => {});

          const result = resolveRound(state);
          if (!result.ended && reason !== 'selected') {
            state.roundLogs.push('◇ The timer expired — the battle continues');
          }
          state.latestLog = state.roundLogs.join('\n');

          if (result.ended) {
            await finishBattle(result);
            return;
          }

          await startRound();
        });
      };

      await startRound();
    } catch (error) {
      activeUsers.delete(player.id);
      console.error('[Battle] Failed:', error.message);
      if (isSlash(interactionOrMessage)) {
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
          await interactionOrMessage.editReply({
            content: 'The battle could not start',
            flags: MessageFlags.Ephemeral
          }).catch(() => {});
        } else {
          await reply(interactionOrMessage, 'The battle could not start');
        }
      } else {
        await reply(interactionOrMessage, 'The battle could not start');
      }
    }
  }
};