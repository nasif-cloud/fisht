// Owner-only prefix command: enable automatic card drops in a channel.
// Usage: op osetdrop #channel

const { configureDropChannel } = require('../../utils/cardDrops');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'osetdrop',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const target = message.mentions.channels.first();
    if (!target || !target.guild || !target.isTextBased?.()) {
      return message.reply({
        content: 'Please mention a server text channel.\nUsage: `op osetdrop #channel`',
        allowedMentions: { repliedUser: false }
      });
    }

    try {
      await configureDropChannel(target, message.author.id);
      await message.react('<:Success:1533154745731256531>');
    } catch (error) {
      console.error('[osetdrop] Failed:', error);
      await message.reply({
        content: 'I could not enable card drops in that channel.',
        allowedMentions: { repliedUser: false }
      });
    }
  }
};