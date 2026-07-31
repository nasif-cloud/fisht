// Owner-only prefix command: give card copies to a user
// Usage: op ocard @user [cardname] [amount]
// The card is found by name or alias (same logic as the info command).
// You cannot specify a mastery level — copies are always of the base card.

const User  = require('../../models/user');
const { cards } = require('../../data/cards');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'ocard',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    // Parse the raw message into usable parts
    // e.g. "op ocard @user Monkey D. Luffy 3"
    // parts = ['op', 'ocard', '<@12345>', 'Monkey', 'D.', 'Luffy', '3']
    const parts  = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();

    // args = everything after "op ocard": ['<@12345>', 'Monkey', 'D.', 'Luffy', '3']
    const args   = parts.slice(2);
    const amount = parseInt(args[args.length - 1]);

    // The card name is everything between the mention and the amount
    // args.slice(1, -1) skips the mention (index 0) and the amount (last item)
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

    // Search for the card by name or alias (case-insensitive, partial match)
    const search    = cardQuery.toLowerCase();
    const foundCard = cards.find(c =>
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(a => a && a.toLowerCase().includes(search))
    );

    if (!foundCard || !foundCard.name) {
      return message.reply({ content: `No card found matching **${cardQuery}**.`, allowedMentions: { repliedUser: false } });
    }

    // Find or create the target user's save data
    let userData = await User.findOne({ userId: target.id });
    if (!userData) userData = new User({ userId: target.id });

    // Update or add the card copy entry
    const now      = new Date();
    const existing = userData.cardCopies.find(c => c.cardName === foundCard.name);
    if (existing) {
      existing.amount      += amount;
      existing.lastObtained = now;
    } else {
      userData.cardCopies.push({ cardName: foundCard.name, amount, lastObtained: now });
    }

    await userData.save();
    await message.react('✅');
  }
};
