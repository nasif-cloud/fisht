// Owner-only prefix command: remove card copies from a user
// Usage: op nocard @user [cardname] [amount]

const User  = require('../../models/user');
const { cards } = require('../../data/cards');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'nocard',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const parts  = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const args   = parts.slice(2); // everything after "op nocard"
    const amount = parseInt(args[args.length - 1]);
    const cardQuery = args.slice(1, -1).join(' ').trim();

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
    if (!existing || existing.amount <= 0) {
      return message.reply({ content: `${target.username} has no copies of **${foundCard.name}**.`, allowedMentions: { repliedUser: false } });
    }

    // Subtract the copies — if it hits 0 or below, remove the entry entirely
    existing.amount -= amount;
    if (existing.amount <= 0) {
      // Mongoose's .pull() removes subdocuments from the array correctly
      userData.cardCopies.pull({ cardName: foundCard.name });
    }

    await userData.save();
    await message.react('✅');
  }
};
