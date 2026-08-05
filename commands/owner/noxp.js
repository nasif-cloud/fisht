// Owner-only prefix command: remove XP from a user
// Usage: op noxp @user [amount]

const User = require('../../models/user');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'noxp',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const parts = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const amount = Number(parts[parts.length - 1]);

    if (!target) {
      return message.reply({
        content: 'Please mention a user.',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return message.reply({
        content: 'Please provide a valid positive whole-number XP amount.',
        allowedMentions: { repliedUser: false }
      });
    }

    const userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({
        content: `${target.username} has no account yet.`,
        allowedMentions: { repliedUser: false }
      });
    }

    userData.xp = Math.max(0, (Number(userData.xp) || 0) - amount);
    await userData.save();
    await message.react('<:Success:1533154745731256531>');
  }
};