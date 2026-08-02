// ─────────────────────────────────────────────
// SETTINGS COMMAND
// ─────────────────────────────────────────────
// Lets each player control their personal notification preferences.
// Uses Discord's Components V2 format — a newer message style where
// text sections and buttons are laid out inside the message itself
// (rather than in a separate embed).
//
// Current settings:
//   • DM When Daily Ready   — bot DMs you at 10:30 PM ET every day
//   • DM When Pulls Ready   — bot DMs you at each pull window reset
//
// Prefix aliases: setting, config

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../models/user');

// ─────────────────────────────────────────────
// HELPER — build the Components V2 component array
// ─────────────────────────────────────────────
// Components V2 uses raw type numbers instead of builder classes:
//   type 17 = Container  (the outer card that holds all the settings content)
//   type  9 = Section    (a row with text on the left, button on the right)
//   type 10 = TextDisplay (plain text that can use markdown like # headings)
//   type 14 = Separator  (a horizontal divider line between sections)
//   type  2 = Button     (inside a Section's "accessory" field)
//
// disabled = true locks all buttons (used when the session expires).
// Expired settings keep the same text; only their buttons are disabled.
function buildComponents(dmDailyReady, dmPullsReady, disabled = false) {
  return [
    {
      // A Container makes the entire settings page appear as one card,
      // like the example image the user provided.
      type: 17,
      components: [
        // ── HEADER ──
        {
          type: 10,
          content: '# Your settings\nManage your user settings.\npage **1** of **1**'
        }
        ,

        // ── DIVIDER ──
        { type: 14, divider: true, spacing: 1 },

        // ── SETTING 1: DM When Daily Ready ──
        // The "accessory" is the button shown on the right side of the section.
        {
          type: 9,
          components: [
            {
              type: 10,
              // Backtick around "24 hours" renders it as inline code in Discord
              content: '# DM When Daily Ready\nEvery `24 hours` at **10:30PM ET**.'
            }
          ],
          accessory: {
            type:      2,                          // Button
            custom_id: 'settings_daily_dm',        // ID the collector listens for
            // Enabled is green. A setting marked Disabled is always grey.
            // Expiring the page also forces the button to grey.
            style:      dmDailyReady && !disabled ? 3 : 2,
            label:      dmDailyReady ? 'Enabled' : 'Disabled',
            emoji:      dmDailyReady ? { name: '✅', id: null } : null,
            disabled
          }
        },

        // ── DIVIDER ──
        { type: 14, divider: true, spacing: 1 },

        // ── SETTING 2: DM When Pulls Ready ──
        {
          type: 9,
          components: [
            {
              type: 10,
              content: '# DM When Pulls Ready\nEvery `8 hours`.'
            }
          ],
          accessory: {
            type:      2,
            custom_id: 'settings_pull_dm',
            // Enabled is green. A setting marked Disabled is always grey.
            // Expiring the page also forces the button to grey.
            style:      dmPullsReady && !disabled ? 3 : 2,
            label:      dmPullsReady ? 'Enabled' : 'Disabled',
            emoji:      dmPullsReady ? { name: '✅', id: null } : null,
            disabled
          }
        }
      ]
    }
  ];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/settings)
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Manage your personal notification settings'),

  // Prefix command definition (op settings / op setting / op config)
  name: 'settings',
  aliases: ['setting', 'config'],

  async execute(interactionOrMessage) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Load current settings from the database ──
    // findOne returns null if the user has no save file yet — that shouldn't
    // happen (registerAccount runs before every command), but we handle it anyway.
    let userData = await User.findOne({ userId: user.id });
    if (!userData) {
      userData = new User({ userId: user.id });
      await userData.save();
    }

    // Read the current toggle values — both default to true for new players
    let dmDailyReady = userData.dmDailyReady ?? true;
    let dmPullsReady = userData.dmPullsReady ?? true;

    // ── STEP 2: Build and send the Components V2 message ──
    // MessageFlags.IsComponentsV2 (= 32768) tells Discord to render
    // the "components" array in V2 mode (with sections, text displays, etc.)
    // instead of the classic button row format.
    const payload = {
      flags:      MessageFlags.IsComponentsV2,
      components: buildComponents(dmDailyReady, dmPullsReady),
      fetchReply: true  // fetchReply gives us back the message object to attach a collector
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      // For prefix commands, channel.send() returns the message directly
      // so fetchReply isn't needed — but we destructure it out to keep the payload clean
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    // ── STEP 3: Listen for button clicks ──
    // The collector watches for any component interaction on this specific message.
    // 5-minute timeout — after that, buttons are locked so stale messages don't confuse people.
    const collector = response.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (interaction) => {
      // Only the person who opened settings can click the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `These aren't yours`, flags: MessageFlags.Ephemeral });
      }

      // Reset the 5-minute inactivity timer on every click
      collector.resetTimer();

      // ── TOGGLE THE CLICKED SETTING ──
      if (interaction.customId === 'settings_daily_dm') {
        // Flip the daily DM toggle and save immediately
        dmDailyReady = !dmDailyReady;
        await User.updateOne({ userId: user.id }, { dmDailyReady });

      } else if (interaction.customId === 'settings_pull_dm') {
        // Flip the pulls DM toggle and save immediately
        dmPullsReady = !dmPullsReady;
        await User.updateOne({ userId: user.id }, { dmPullsReady });
      }

      // ── REBUILD AND UPDATE THE MESSAGE ──
      // We include the flag again so Discord knows to keep rendering in V2 mode
      await interaction.update({
        flags:      MessageFlags.IsComponentsV2,
        components: buildComponents(dmDailyReady, dmPullsReady)
      });
    });

    // ── STEP 4: Lock buttons when the session expires ──
    // When the 5-minute timer runs out, we rebuild the components with all
    // buttons set to disabled: true so clicking them does nothing.
    // This makes it obvious the session is over without deleting the message.
    collector.on('end', () => {
      response.edit({
        flags:      MessageFlags.IsComponentsV2,
        components: buildComponents(dmDailyReady, dmPullsReady, true) // true = disabled
      }).catch(() => {});
      // .catch() silently handles the case where the message was deleted
    });
  }
};
