// Guild-admin command: allow bot commands in a channel again.
//
// Prefix: op allow #channel [commandname]
// Slash:  /allow channel:#channel command:[commandname]
//
// Leaving out the command name removes every bot-command restriction from
// the channel. With a command name, only that command is allowed again.

const {
  SlashCommandBuilder,
  PermissionsBitField
} = require('discord.js');
const {
  normalizeCommandName,
  allowCommands
} = require('../../utils/channelRestrictions');

function replyError(source, content, isSlash) {
  return isSlash
    ? source.reply({ content, flags: 64 })
    : source.reply({ content, allowedMentions: { repliedUser: false } });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('allow')
    .setDescription('Allow bot commands in a guild channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The channel where commands should be allowed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Optional command name to allow only that command')
        .setRequired(false)
    ),

  name: 'allow',

  async execute(interactionOrMessage, args = []) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const member = interactionOrMessage.member;

    // Only members with Discord's Administrator permission may change rules.
    if (!member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
      return replyError(interactionOrMessage, 'Only guild administrators can use this command', isSlash);
    }

    const targetChannel = isSlash
      ? interactionOrMessage.options.getChannel('channel')
      : interactionOrMessage.mentions.channels.first();

    if (!targetChannel || !targetChannel.isTextBased?.()) {
      return replyError(interactionOrMessage, 'Please provide a valid text channel', isSlash);
    }

    const requestedName = isSlash
      ? interactionOrMessage.options.getString('command')
      : args.slice(1).join(' ').trim();
    const commandName = normalizeCommandName(requestedName);

    // Resolve aliases to the command's canonical name for consistent removal.
    const resolvedCommand = commandName
      ? interactionOrMessage.client.commands.get(commandName)
      : null;
    if (commandName && !resolvedCommand) {
      return replyError(interactionOrMessage, `No command found named \`${commandName}\``, isSlash);
    }

    await allowCommands(
      interactionOrMessage.guild.id,
      targetChannel.id,
      resolvedCommand?.name || null
    );

    if (isSlash) {
      return interactionOrMessage.reply({
        content: '<:Success:1533154745731256531>',
        flags: 64
      });
    }
    return interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};