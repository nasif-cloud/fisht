// Owner-only prefix command: make every copy of a user's card shiny
// Usage: op oshinify @user [cardname]
// The card can be found by its name or alias.
//
// Shiny is stored on the character's card entry, not on individual copies.
// Therefore setting `shiny: true` makes all copies of that character shiny.

const User = require('../../models/user');
const { cards } = require('../../data/cards');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'oshinify',

  async execute(message) {
    // Silently ignore anyone who is not the owner
    if (message.author.id !== OWNER_ID) return;

    // Example:
    // "op oshinify @user Monkey D. Luffy"
    const parts = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const cardQuery = parts.slice(2).join(' ').replace(/^<@!?\d+>\s*/, '').trim();

    if (!target) {
      return message.reply({
        content: 'Please mention a user',
        allowedMentions: { repliedUser: false }
      });
    }

    if (!cardQuery) {
      return message.reply({
        content: 'Please provide a card name',
        allowedMentions: { repliedUser: false }
      });
    }

    // Find the card by its name or alias, using the same search behavior as ocard
    const search = cardQuery.toLowerCase();
    const foundCard = cards.find(card =>
      card.name.toLowerCase().includes(search) ||
      card.aliases.some(alias => alias && alias.toLowerCase().includes(search))
    );

    if (!foundCard || !foundCard.name) {
      return message.reply({
        content: `No card found matching \`${cardQuery}\``,
        allowedMentions: { repliedUser: false }
      });
    }

    const userData = await User.findOne({ userId: target.id });
    if (!userData) {
      return message.reply({
        content: `${target.username} has no account yet`,
        allowedMentions: { repliedUser: false }
      });
    }

    // Update every matching entry so all copies are shiny, even if old data
    // happens to contain more than one entry for the same character.
    const matchingEntries = userData.cardCopies.filter(entry =>
      entry.cardName === foundCard.name && entry.amount > 0
    );

    if (matchingEntries.length === 0) {
      return message.reply({
        content: `${target.username} does not own \`${foundCard.name}\``,
        allowedMentions: { repliedUser: false }
      });
    }

    for (const entry of matchingEntries) {
      entry.shiny = true;
    }

    await userData.save();
    await message.react('<:Success:1533154745731256531>');
  }
};