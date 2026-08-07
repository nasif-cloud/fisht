// ─────────────────────────────────────────────
// OKEY — owner raid key grant
// ─────────────────────────────────────────────
// Usage: op okey @user [silver|iron] [amount]
// Lets the owner top up a player's Silver or Iron keys directly. Golden keys
// are earned through the raid shop exchange, so they are not grantable here.

const User = require('../../models/user');
const { findInventoryItem } = require('../../data/inventoryItems');

const OWNER_ID = '1257718161298690119';
const SUCCESS_REACTION = '<:Success:1533154745731256531>';

// Only these two keys can be granted — they are the ones spent in the raid shop.
const GRANTABLE_FIELDS = new Set(['silverKeys', 'ironKeys']);

function getTarget(args) {
  // A mention is the most common input (op okey @user silver 5).
  const mentionMatch = args[0]?.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return { id: mentionMatch[1] };

  // Otherwise allow a raw user ID as the first argument.
  const raw = args[0] || '';
  if (/^\d{17,20}$/.test(raw)) return { id: raw };
  return null;
}

function getItemAndAmount(args) {
  // When the first arg was a mention, the item is args[1], else args[1].
  const isMention = /^<@!?\d+>$/.test(args[0] || '');
  const item = findInventoryItem(args[isMention ? 1 : 1]);
  const amountText = args[isMention ? 2 : 2];
  return {
    item,
    amount: amountText === undefined ? 1 : Number(amountText)
  };
}

module.exports = {
  name: 'okey',

  async execute(message, args) {
    if (message.author.id !== OWNER_ID) return;

    const target = getTarget(args);
    const { item, amount } = getItemAndAmount(args);

    if (!target) {
      return message.reply({
        content: 'Please mention a user or provide their ID.',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!item || !GRANTABLE_FIELDS.has(item.field)) {
      return message.reply({
        content: 'Please choose a grantable key: `silver` or `iron`.',
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
        content: `${target.id} has no account yet.`,
        allowedMentions: { repliedUser: false }
      });
    }

    userData[item.field] = (Number(userData[item.field]) || 0) + amount;
    await userData.save();
    return message.react(SUCCESS_REACTION);
  }
};
