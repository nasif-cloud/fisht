// Owner-only prefix command: remove card copies from a user
// Usage: op nocard @user [cardname] [amount]
// The amount can also come before the card name, for example:
// op nocard @user 100000 benn

const User  = require('../../models/user');
const { cards } = require('../../data/cards');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'nocard',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const parts  = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const args = parts.slice(2); // everything after "op nocard"

    // Find the numeric argument wherever it appears so both
    // "@user benn 100000" and "@user 100000 benn" work.
    const amountIndex = args.findIndex(value => /^-?\d+$/.test(value));
    const rawAmount = amountIndex === -1 ? NaN : Number(args[amountIndex]);
    // A negative removal amount must never add copies back to the user.
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : NaN;
    const cardQuery = args
      .filter((_, index) => index !== amountIndex && !/^<@!?\d+>$/.test(args[index]))
      .join(' ')
      .trim();

    if (!target) {
      return message.reply({ content: 'Please mention a user.', allowedMentions: { repliedUser: false } });
    }
    if (!cardQuery) {
      return message.reply({ content: 'Please provide a card name.', allowedMentions: { repliedUser: false } });
    }
    if (isNaN(amount) || amount <= 0) {
      return message.reply({ content: 'Please provide a valid positive amount.', allowedMentions: { repliedUser: false } });
    }

    // Find the card by name or alias
    const search    = cardQuery.toLowerCase();
    const foundCard = cards.find(c =>
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(a => a && a.toLowerCase().includes(search))
    );

    if (!foundCard || !foundCard.name) {
      return message.reply({ content: `No card found matching **${cardQuery}**.`, allowedMentions: { repliedUser: false } });
    }

    // Load the target user's data
    const userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({ content: `${target.username} has no account yet.`, allowedMentions: { repliedUser: false } });
    }

    const existing = userData.cardCopies.find(c => c.cardName === foundCard.name);
    if (!existing) {
      return message.reply({ content: `${target.username} has no copies of **${foundCard.name}**.`, allowedMentions: { repliedUser: false } });
    }

    // Normalize old malformed data before doing the subtraction.
    const currentAmount = Math.max(0, Number(existing.amount) || 0);
    if (currentAmount === 0) {
      existing.amount = 0;
      await userData.save();
      return message.reply({ content: `${target.username} has no copies of **${foundCard.name}**.`, allowedMentions: { repliedUser: false } });
    }

    // Clamp at zero so removing more copies than the user owns never creates
    // a negative amount. Remove an empty entry from the collection afterward.
    existing.amount = Math.max(0, currentAmount - amount);
    if (existing.amount === 0) {
      // Mongoose's .pull() removes subdocuments from the array correctly
      userData.cardCopies.pull({ cardName: foundCard.name });
    }

    await userData.save();
    await message.react('<:Success:1533154745731256531>');
  }
};
