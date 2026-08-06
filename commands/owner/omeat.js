// Owner-only prefix command: give Meat to a user
// Usage: op omeat @user [amount]

const User = require('../../models/user');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'omeat',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const parts  = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const amount = parseInt(parts[parts.length - 1]);

    if (!target) {
      return message.reply({ content: 'Please mention a user.', allowedMentions: { repliedUser: false } });
    }
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ content: 'Please provide a valid positive amount.', allowedMentions: { repliedUser: false } });
    }

    let userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({
        content: `${target.username} has no account yet.`,
        allowedMentions: { repliedUser: false }
      });
    }

    userData.meat += amount;
    await userData.save();

    await message.react('✅');
  }
};
