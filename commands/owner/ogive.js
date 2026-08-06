// ─────────────────────────────────────────────
// OGIVE — owner item grant
// ─────────────────────────────────────────────
// Usage: op ogive @user [beli|meat|wine|beer|chest] [amount]

const User = require('../../models/user');
const { findInventoryItem } = require('../../data/inventoryItems');

const OWNER_ID = '1257718161298690119';
const SUCCESS_REACTION = '<:Success:1533154745731256531>';

function getTarget(message, args) {
  return message.mentions.users.first() || (args[0] ? { id: args[0] } : null);
}

function getItemAndAmount(message, args) {
  const targetWasMentioned = message.mentions.users.size > 0;
  const itemIndex = targetWasMentioned ? 1 : 1;
  const amountText = args[itemIndex + 1];
  return {
    item: findInventoryItem(args[itemIndex]),
    amount: amountText === undefined ? 1 : Number(amountText)
  };
}

module.exports = {
  name: 'ogive',

  async execute(message, args) {
    if (message.author.id !== OWNER_ID) return;

    const target = getTarget(message, args);
    const { item, amount } = getItemAndAmount(message, args);

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

    userData[item.field] = (Number(userData[item.field]) || 0) + amount;
    await userData.save();
    return message.react(SUCCESS_REACTION);
  }
};