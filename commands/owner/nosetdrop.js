// Owner-only prefix command: disable automatic card drops in a channel.
// Usage: op nosetdrop #channel
// If no channel is mentioned, the command's current channel is disabled.

const { disableDropChannel } = require('../../utils/cardDrops');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'nosetdrop',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const target = message.mentions.channels.first() || message.channel;
    const disabled = await disableDropChannel(message.guild.id, target.id);

    if (!disabled) {
      return message.reply({
        content: `Card drops were not enabled in <#${target.id}>`,
        allowedMentions: { repliedUser: false }
      });
    }

    await message.react('<:Success:1533154745731256531>');
  }
};