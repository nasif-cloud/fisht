// ─────────────────────────────────────────────
// PITY COMMAND
// ─────────────────────────────────────────────
// Shows persistent progress toward the S, SS, and UR guaranteed pulls.

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const {
  PITY_THRESHOLDS,
  formatPityLine
} = require('../../utils/pity');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pity')
    .setDescription('View your S, SS, and UR pity progress'),

  name: 'pity',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    let userData = await User.findOne({ userId: user.id });
    if (!userData) userData = new User({ userId: user.id });

    const content = [
      formatPityLine('S', userData),
      formatPityLine('SS', userData),
      formatPityLine('UR', userData)
    ].join('\n');

    const payload = {
      content,
      allowedMentions: { repliedUser: false }
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      return interactionOrMessage.reply({ ...payload, flags: 64 });
    }
    return interactionOrMessage.reply(payload);
  }
};