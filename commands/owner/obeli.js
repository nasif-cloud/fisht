// Owner-only prefix command: give Berries to a user
// Usage: op obeli @user [amount]

const User = require('../../models/user');

// Only this Discord user ID can run owner commands
const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'obeli',
  // No 'data' property — this is prefix-only, not registered as a slash command

  async execute(message) {
    // Silently ignore if the sender is not the owner
    if (message.author.id !== OWNER_ID) return;

    // Parse arguments from the raw message content
    // e.g. "op obeli @user 500" → parts = ['op', 'obeli', '<@12345>', '500']
    const parts  = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const amount = parseInt(parts[parts.length - 1]);

    // Validate inputs
    if (!target) {
      return message.reply({ content: 'Please mention a user.', allowedMentions: { repliedUser: false } });
    }
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ content: 'Please provide a valid positive amount.', allowedMentions: { repliedUser: false } });
    }

    // Owner grants never create accounts for users who have not used the bot.
    let userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({
        content: `${target.username} has no account yet.`,
        allowedMentions: { repliedUser: false }
      });
    }

    // Add the berries and save
    userData.balance += amount;
    await userData.save();

    // React with a green checkmark to confirm success — no text reply
    await message.react('<:Success:1533154745731256531>');
  }
};
