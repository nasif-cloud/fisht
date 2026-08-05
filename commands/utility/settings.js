// ─────────────────────────────────────────────
// SETTINGS COMMAND
// ─────────────────────────────────────────────
// Lets each player control their personal notification preferences.
// Uses Discord's Components V2 format — a newer message style where
// text sections and buttons are laid out inside the message itself
// (rather than in a separate embed).
//
// Settings are split across two pages so the message stays compact:
//   Page 1 — daily, pulls, level-up, and quest notifications
//   Page 2 — duel reward notifications
//
// Prefix aliases: setting, config

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../models/user');

const SETTINGS_PAGE_COUNT = 2;

// ─────────────────────────────────────────────
// COMPONENT HELPERS
// ─────────────────────────────────────────────

// Creates the Enabled/Disabled button shown beside a setting.
function settingButton(customId, enabled, disabled = false) {
  return {
    type: 2,
    custom_id: customId,
    style: enabled && !disabled ? 3 : 2,
    label: enabled ? 'Enabled' : 'Disabled',
    emoji: enabled ? { name: '✅', id: null } : null,
    disabled
  };
}

// Creates one setting row with its description and toggle button.
function settingRow(customId, content, enabled, disabled = false) {
  return {
    type: 9,
    components: [{ type: 10, content }],
    accessory: settingButton(customId, enabled, disabled)
  };
}

function divider() {
  return { type: 14, divider: true, spacing: 1 };
}

// Components V2 uses raw type numbers:
//   type 17 = Container, type 9 = Section, type 10 = TextDisplay,
//   type 14 = Separator, and type 2 = Button.
function buildComponents(
  page,
  dmDailyReady,
  dmPullsReady,
  dmLevelUp,
  dmQuestsReady,
  dmDuelReward,
  disabled = false
) {
  const pageComponents = page === 2
    ? [
        settingRow(
          'settings_duel_reward_dm',
          '# DM When Duel Reward\nReceive a DM when your daily duel reward is ready every `24 Hours`.',
          dmDuelReward,
          disabled
        )
      ]
    : [
        settingRow(
          'settings_daily_dm',
          '# DM When Daily Ready\nEvery `24 hours`.',
          dmDailyReady,
          disabled
        ),
        divider(),
        settingRow(
          'settings_pull_dm',
          '# DM When Pulls Ready\nEvery `8 hours`.',
          dmPullsReady,
          disabled
        ),
        divider(),
        settingRow(
          'settings_level_up_dm',
          '# DM When Level Up\nReceive a DM with your level-up rewards.',
          dmLevelUp,
          disabled
        ),
        divider(),
        settingRow(
          'settings_quests_dm',
          '# DM When Quests Ready\nReceive a DM when your daily quests refresh.',
          dmQuestsReady,
          disabled
        )
      ];

  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `# Your settings\nManage your user settings.\npage **${page}** of **${SETTINGS_PAGE_COUNT}**`
        },
        divider(),
        ...pageComponents,
        divider(),
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: 'settings_previous',
              style: 2,
              label: 'Previous',
              disabled: disabled || page === 1
            },
            {
              type: 2,
              custom_id: 'settings_next',
              style: 2,
              label: 'Next',
              disabled: disabled || page === SETTINGS_PAGE_COUNT
            }
          ]
        }
      ]
    }
  ];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Manage your personal notification settings'),

  name: 'settings',
  aliases: ['setting', 'config'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // Load the current settings from the database.
    let userData = await User.findOne({ userId: user.id });
    if (!userData) {
      userData = new User({ userId: user.id });
      await userData.save();
    }

    let dmDailyReady = userData.dmDailyReady ?? true;
    let dmPullsReady = userData.dmPullsReady ?? true;
    let dmLevelUp = userData.dmLevelUp ?? true;
    let dmQuestsReady = userData.dmQuestsReady ?? true;
    let dmDuelReward = userData.dmDuelReward ?? true;
    let page = 1;

    function buildPayload(expired = false) {
      return {
        flags: MessageFlags.IsComponentsV2,
        components: buildComponents(
          page,
          dmDailyReady,
          dmPullsReady,
          dmLevelUp,
          dmQuestsReady,
          dmDuelReward,
          expired
        )
      };
    }

    const payload = {
      ...buildPayload(),
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    // Buttons remain active for five minutes and the timer resets after use.
    const collector = response.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: `These aren't yours`,
          flags: MessageFlags.Ephemeral
        });
      }

      collector.resetTimer();

      if (interaction.customId === 'settings_previous') {
        page = Math.max(1, page - 1);
      } else if (interaction.customId === 'settings_next') {
        page = Math.min(SETTINGS_PAGE_COUNT, page + 1);
      } else if (interaction.customId === 'settings_daily_dm') {
        dmDailyReady = !dmDailyReady;
        await User.updateOne({ userId: user.id }, { dmDailyReady });
      } else if (interaction.customId === 'settings_pull_dm') {
        dmPullsReady = !dmPullsReady;
        await User.updateOne({ userId: user.id }, { dmPullsReady });
      } else if (interaction.customId === 'settings_level_up_dm') {
        dmLevelUp = !dmLevelUp;
        await User.updateOne({ userId: user.id }, { dmLevelUp });
      } else if (interaction.customId === 'settings_quests_dm') {
        dmQuestsReady = !dmQuestsReady;
        await User.updateOne({ userId: user.id }, { dmQuestsReady });
      } else if (interaction.customId === 'settings_duel_reward_dm') {
        dmDuelReward = !dmDuelReward;
        await User.updateOne({ userId: user.id }, { dmDuelReward });
      } else {
        return;
      }

      await interaction.update(buildPayload());
    });

    // Lock all buttons when the session expires.
    collector.on('end', () => {
      response.edit(buildPayload(true)).catch(() => {});
    });
  }
};