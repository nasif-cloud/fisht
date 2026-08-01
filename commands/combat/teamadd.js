// ─────────────────────────────────────────────
// TEAMADD COMMAND
// ─────────────────────────────────────────────
// Add a card you own to an available team slot (max 3 cards total).
// The same card cannot appear twice on the same team.
//
// Slash: /teamadd card:[name]
// Prefix: op teamadd [name]   (aliases: ta)

const { SlashCommandBuilder } = require('discord.js');
const { cards } = require('../../data/cards');
const User = require('../../models/user');

module.exports = {
  // Slash command definition
  data: new SlashCommandBuilder()
    .setName('teamadd')
    .setDescription('Add a card to your team.')
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('The card name or alias to add')
        .setRequired(true)
    ),

  name: 'teamadd',
  aliases: ['ta'],

  async execute(interactionOrMessage, args) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const user    = interactionOrMessage.user || interactionOrMessage.author;

    // ── Get the search query ──
    const query = isSlash
      ? interactionOrMessage.options.getString('card').trim()
      : args.join(' ').trim();

    if (!query) {
      const msg = 'Please provide a card name.';
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // ── Find the card in the card library ──
    const lq = query.toLowerCase();
    const card = cards.find(c =>
      c.name.toLowerCase().includes(lq) ||
      (c.aliases || []).some(a => a && a.toLowerCase().includes(lq))
    );

    if (!card) {
      const msg = `**${query}** is not a valid card`;
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // ── Load the user's save data ──
    const userData = await User.findOne({ userId: user.id });

    // Check the user actually owns the card
    const owned = userData?.cardCopies?.find(e => e.cardName === card.name && e.amount > 0);
    if (!owned) {
      const msg = `You don't own **${card.name}**`;
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // Check if the card is already on the team
    const team = userData.teamCards || [];
    if (team.includes(card.name)) {
      const msg = `**${card.name}** is already in your team`;
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // Check if the team is already full (3 cards max)
    if (team.length >= 3) {
      const msg = `Your team is full. Remove a card first with \`teamremove\``;
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // ── Add the card and save ──
    userData.teamCards = [...team, card.name];
    await userData.save();

    // ── Success: react ✅ for prefix, ephemeral ✅ for slash ──
    if (isSlash) {
      return interactionOrMessage.reply({ content: '<:Success:1533154745731256531>', flags: 64 });
    }
    await interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};
