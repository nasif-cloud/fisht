// ─────────────────────────────────────────────
// NOGIVE — owner item removal
// ─────────────────────────────────────────────
// Usage: op nogive @user [beli|meat|wine|beer|chest] [amount]

const User = require('../../models/user');
const { findInventoryItem } = require('../../data/inventoryItems');

const OWNER_ID = '1257718161298690119';
const SUCCESS_REACTION = '<:Success:1533154745731256531>';

module.exports = {
  name: 'nogive',

  async execute(message, args) {
    if (message.author.id !== OWNER_ID) return;

    const target = message.mentions.users.first() || (args[0] ? { id: args[0] } : null);
    const targetWasMentioned = message.mentions.users.size > 0;
    const item = findInventoryItem(args[targetWasMentioned ? 1 : 1]);
    const amountText = args[targetWasMentioned ? 2 : 2];
    const amount = amountText === undefined ? 1 : Number(amountText);

    if (!target) {
      return message.reply({
        content: 'Please mention a user or provide their ID.',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!item) {
      return message.reply({
        content: 'Please choose an item: `beli`, `meat`, `wine`, `beer`, or `chest`.',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return message.reply({
        content: 'Please provide a valid positive whole-number amount.',
        allowedMentions: { repliedUser: false }
      });
    }

    const userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({
        content: `${target.username || target.id} has no account yet.`,
        allowedMentions: { repliedUser: false }
      });
    }

    // Floor at zero so owner removals can never create negative inventory.
    userData[item.field] = Math.max(0, (Number(userData[item.field]) || 0) - amount);
    await userData.save();
    return message.react(SUCCESS_REACTION);
  }
};