// ─────────────────────────────────────────────
// TEAMREMOVE COMMAND
// ─────────────────────────────────────────────
// Remove a card from your team by name or alias.
//
// Slash: /teamremove card:[name]
// Prefix: op teamremove [name]   (aliases: tr)

const { SlashCommandBuilder } = require('discord.js');
const { cards } = require('../../data/cards');
const User = require('../../models/user');

module.exports = {
  // Slash command definition
  data: new SlashCommandBuilder()
    .setName('teamremove')
    .setDescription('Remove a card from your team.')
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('The card name or alias to remove')
        .setRequired(true)
    ),

  name: 'teamremove',
  aliases: ['tr'],

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
    const team = userData?.teamCards || [];

    // Check the card is actually on the team
    if (!team.includes(card.name)) {
      const msg = `**${card.name}** is not in your team`;
      return isSlash
        ? interactionOrMessage.reply({ content: msg, flags: 64 })
        : interactionOrMessage.reply({ content: msg, allowedMentions: { repliedUser: false } });
    }

    // ── Remove the card and save ──
    userData.teamCards = team.filter(name => name !== card.name);
    await userData.save();

    // ── Success: react ✅ for prefix, ephemeral ✅ for slash ──
    if (isSlash) {
      return interactionOrMessage.reply({ content: '<:Success:1533154745731256531>', flags: 64 });
    }
    await interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};
