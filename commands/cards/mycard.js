// discord.js components needed for this command
const { SlashCommandBuilder } = require('discord.js');

// Card data and helper functions from the central card library
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');

// The User model so we can look up which cards the player owns
const User = require('../../models/user');

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  // This shows up when a user types /mycard in Discord
  data: new SlashCommandBuilder()
    .setName('mycard')
    .setDescription('View a card you own at your current mastery level')
    .addStringOption(option =>
      option.setName('query').setDescription('Name or alias of the card').setRequired(true)
    ),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'mycard',
  aliases: ['mc'], // 'op mc luffy' works the same as 'op mycard luffy'

  async execute(interactionOrMessage, args) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // --- STEP 1: Figure out what the user searched for ---
    let query = '';
    if (interactionOrMessage.isChatInputCommand?.()) {
      // Slash command: Discord gives us the option value directly
      query = interactionOrMessage.options.getString('query');
    } else {
      // Prefix command: extract the search term from the message text
      if (args) {
        query = args.join(' ');
      } else {
        // "op mycard monkey d luffy" → remove "op" and "mycard", keep "monkey d luffy"
        query = interactionOrMessage.content.split(' ').slice(2).join(' ');
      }
    }

    if (!query) {
      return interactionOrMessage.reply('Please provide a valid card name.');
    }

    // Convert to lowercase so the search isn't case-sensitive
    const search = query.toLowerCase();

    // --- STEP 2: Find the card in the card library ---
    // Searches by name or alias only (titles are not searchable)
    const foundCard = cards.find(c =>
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(alias => alias.toLowerCase().includes(search))
    );

    if (!foundCard) {
      return interactionOrMessage.reply(`**${query}** is not a valid card.`);
    }

    // --- STEP 3: Check if the user actually owns this card ---
    const userData = await User.findOne({ userId: user.id });
    const copyEntry = userData?.cardCopies?.find(c => c.cardName === foundCard.name);
    const ownedCopies = copyEntry?.amount || 0;

    // If the user doesn't own this card at all, tell them and stop
    if (ownedCopies === 0) {
      return interactionOrMessage.reply(`You do not own **${foundCard.name}**`);
    }

    // --- STEP 4: Determine their current mastery level ---
    // Mastery is based on how many copies they own:
    //   1 copy  → Mastery 1
    //   2 copies → Mastery 2
    //   3+ copies → Mastery 3
    // Math.min ensures we never go above 3 even if they own 10 copies.
    const masteryLevel = Math.min(ownedCopies, 3);

    // --- STEP 5: Pick the right stat block for their mastery level ---
    // The base card is M1; M2 and M3 are upgraded versions stored in foundCard.M2 / foundCard.M3
    let cardData = foundCard;              // defaults to M1
    if (masteryLevel === 2) cardData = foundCard.M2;
    if (masteryLevel === 3) cardData = foundCard.M3;

    // safeRank makes sure we never crash if a card has a typo in its rank field
    const rank = safeRank(cardData.rank);
    if (rank !== cardData.rank) {
      console.warn(`[MyCard] Card "${foundCard.name}" (M${masteryLevel}) has invalid rank "${cardData.rank}". Displaying with fallback rank D.`);
    }

    // resolveStat converts filter values like '+' or '--' into real numbers.
    // We pass foundCard.name + masteryLevel so stats are always fixed — same card, same numbers.
    const resolvedPower  = resolveStat(rank, 'power',  safeStat(cardData.power),  foundCard.name, masteryLevel);
    const resolvedHealth = resolveStat(rank, 'health', safeStat(cardData.health), foundCard.name, masteryLevel);
    const resolvedSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  foundCard.name, masteryLevel);

    // Grab the colour and thumbnail icon for this rank + mastery level from rankConfig
    const visual = rankConfig[rank][`M${masteryLevel}`];

    // --- STEP 6: Build and send the embed ---
    // No Previous/Next buttons here — we only show the mastery the user currently owns.
    const embed = {
      title: foundCard.name,
      description: [
        `${cardData.title}`,
        ` `,
        `**Rank:** ${cardData.rank}`,
        `**Health:** ${resolvedHealth}`,
        `**Power:** ${resolvedPower}`,
        `**Speed:** ${resolvedSpeed}`,
        `**Copies:** ${ownedCopies}`
      ].join('\n'),
      footer: {
        icon_url: user.displayAvatarURL({ dynamic: true }),
        text: `Mastery ${masteryLevel}/3`
      },
      color: visual.color,
      thumbnail: { url: visual.icon },
      image: { url: cardData.image }
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      await interactionOrMessage.reply({ embeds: [embed] });
    } else {
      await interactionOrMessage.channel.send({ embeds: [embed] });
    }
  }
};
