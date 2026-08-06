// ─────────────────────────────────────────────
// DAILY QUESTS
// ─────────────────────────────────────────────
// Shows the player's three randomly assigned daily quests in a Components V2
// container. Quest claims are handled by the button collector below.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../models/user');
const {
  QUEST_REWARD_BELI,
  QUEST_REWARD_XP,
  ALL_QUESTS_REWARD_CHEST,
  ensureDailyQuests,
  claimQuest,
  buildProgressBar,
  getNextDailyReset
} = require('../../utils/quests');
const {
  addXp,
  sendLevelUpNotifications
} = require('../../utils/levels');

const SESSION_TIME_MS = 300000;

function formatTimeRemaining(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function buildComponents(userData, disabled = false) {
  const quests = userData.dailyQuests || [];
  const claimedCount = quests.filter(quest => quest.claimed).length;
  const nextReset = getNextDailyReset();
  const resetText = formatTimeRemaining(nextReset - Date.now());

  const components = [
    {
      type: 10,
      content:
        '# Daily Quests\n' +
        `Complete quests for **${QUEST_REWARD_BELI.toLocaleString('en-US')}** <:SilverCoin:1534757841867374782> and **${QUEST_REWARD_XP} XP** each.\n` +
        `✦ Refreshes in **${resetText}**.\n` +
        `◇ Claimed **${claimedCount}/${quests.length}**`
    },
    { type: 14, divider: true, spacing: 1 }
  ];

  quests.forEach((quest, index) => {
    const progress = Math.min(quest.target, quest.progress);
    components.push({
      type: 9,
      components: [
        {
          type: 10,
          content:
            `## ${quest.label}\n` +
            `Progress ${buildProgressBar(progress, quest.target)} **${progress}/${quest.target}**`
        }
      ],
      accessory: {
        type: 2,
        custom_id: `quest_claim_${index}`,
        style: quest.claimed ? 3 : 2,
        label: quest.claimed ? 'Claimed' : 'Claim',
        disabled: disabled || quest.claimed
      }
    });
    if (index < quests.length - 1) {
      components.push({ type: 14, divider: true, spacing: 1 });
    }
  });

  components.push(
    { type: 14, divider: true, spacing: 1 },
    {
      type: 10,
      content:
        `Each quest gives **${QUEST_REWARD_BELI.toLocaleString('en-US')}** <:SilverCoin:1534757841867374782> and **${QUEST_REWARD_XP} XP**.` +
        ` Claim all ${quests.length} for **${ALL_QUESTS_REWARD_CHEST}** <:Chest:1534758406944985302> Chest.`
    }
  );

  return [{ type: 17, components }];
}

function getReplyPayload(content) {
  return {
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { repliedUser: false }
  };
}

function getEditPayload(content) {
  return {
    content,
    allowedMentions: { repliedUser: false }
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View and claim your daily quests'),

  name: 'quests',
  aliases: ['quest', 'q'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    let userData = await User.findOne({ userId: user.id });
    if (!userData) userData = new User({ userId: user.id });
    ensureDailyQuests(userData);
    await userData.save();

    const payload = {
      flags: MessageFlags.IsComponentsV2,
      components: buildComponents(userData),
      allowedMentions: { repliedUser: false },
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    const collector = response.createMessageComponentCollector({
      time: SESSION_TIME_MS
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply(getReplyPayload(`These aren't your quests.`));
      }

      const match = interaction.customId.match(/^quest_claim_(\d+)$/);
      if (!match) return;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        userData = await User.findOne({ userId: user.id });
        if (!userData) userData = new User({ userId: user.id });
        ensureDailyQuests(userData);

        const result = claimQuest(userData, Number(match[1]));
        if (!result.ok) {
          return interaction.editReply(getEditPayload(result.reason));
        }

        userData.lastQuestClaimAt = new Date();
        userData.balance = (Number(userData.balance) || 0) + QUEST_REWARD_BELI;
        const xpResult = addXp(userData, QUEST_REWARD_XP);
        await userData.save();

        const rewardLines = [
          `You claimed **${result.quest.label}**!`,
          `You received **${QUEST_REWARD_BELI.toLocaleString('en-US')}** <:SilverCoin:1534757841867374782> Beli and **${QUEST_REWARD_XP} XP**.`
        ];
        if (result.allClaimed) {
          rewardLines.push(
            `You claimed all three quests and received **${ALL_QUESTS_REWARD_CHEST}** <:Chest:1534758406944985302> Chest`
          );
        }
        if (xpResult.levelsGained > 0) {
          rewardLines.push(`You reached level **${xpResult.after.level}**!`);
        }

        const resultMessage = await interaction.editReply(getEditPayload(rewardLines.join('\n')));
        await sendLevelUpNotifications(
          user,
          userData,
          xpResult,
          interactionOrMessage.channel,
          resultMessage
        );
        await response.edit({
          flags: MessageFlags.IsComponentsV2,
          components: buildComponents(userData),
          allowedMentions: { repliedUser: false }
        });
      } catch (error) {
        console.error('[Quests] Claim failed:', error.message);
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(getEditPayload('I could not claim that quest right now. Please try again.'));
        }
      }
    });

    collector.on('end', () => {
      response.edit({
        flags: MessageFlags.IsComponentsV2,
        components: buildComponents(userData, true),
        allowedMentions: { repliedUser: false }
      }).catch(() => {});
    });
  }
};