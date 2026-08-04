// ─────────────────────────────────────────────
// PROFILE COMMAND
// ─────────────────────────────────────────────
// Shows a player's level, global XP rank, avatar, and progress to the next
// level. It works as /profile and as op user / op level.

const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder
} = require('discord.js');

const User = require('../../models/user');
const { getLevelProgress } = require('../../utils/levels');
const { renderProfileCard, getProfileColor } = require('../../utils/profileCard');

async function getGlobalRank(userData) {
  const xp = Math.max(0, Number(userData?.xp) || 0);
  // Players with the same XP share the same rank.
  return (await User.countDocuments({ xp: { $gt: xp } })) + 1;
}

function getPrefixTarget(message) {
  return message.mentions?.users?.first() || message.author;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a player profile')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The player whose profile you want to view')
        .setRequired(false)
    ),

  name: 'profile',
  aliases: ['user', 'level'],
  description: 'View a player profile',

  async execute(interactionOrMessage) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const viewer = interactionOrMessage.user || interactionOrMessage.author;
    const target = isSlash
      ? interactionOrMessage.options.getUser('user') || viewer
      : getPrefixTarget(interactionOrMessage);

    const userData = await User.findOne({ userId: target.id }) || new User({ userId: target.id });
    const progress = getLevelProgress(userData.xp);
    const globalRank = await getGlobalRank(userData);
    const image = await renderProfileCard({
      avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
      username: target.username,
      level: progress.level,
      currentXp: progress.currentXp,
      xpNeeded: progress.xpNeeded,
      globalRank
    });

    const profileEmbed = new EmbedBuilder()
      .setColor(getProfileColor(progress.level))
      .setTitle(`${target.username}'s Profile`)
      .setImage('attachment://profile.png');

    const payload = {
      embeds: [profileEmbed],
      files: [new AttachmentBuilder(image, { name: 'profile.png' })]
    };

    if (isSlash) {
      await interactionOrMessage.reply(payload);
    } else {
      await interactionOrMessage.channel.send(payload);
    }
  }
};