// discord.js components we need for this command
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Card data and helper functions from the central card library
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const { getCardAutocompleteChoices } = require('../../utils/cardAutocomplete');


module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  // This is what shows up when a user types /info in Discord
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Check info about a card')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Name')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'info',
  aliases: ['i', 'card'], // 'op i luffy' works the same as 'op info luffy'

  // Supplies card-name suggestions while a user types /info query
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    return interaction.respond(getCardAutocompleteChoices(cards, focused));
  },

  async execute(interactionOrMessage, args) {
    // Works for both slash commands (/info luffy) and prefix commands (op info luffy)
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // --- STEP 1: Figure out what the user searched for ---
    let query = '';
    if (interactionOrMessage.isChatInputCommand?.()) {
      // Slash command: Discord gives us the option value directly
      query = interactionOrMessage.options.getString('query');
    } else {
      // Prefix command: we have to extract the search term from the message text
      if (args) {
        query = args.join(' ');
      } else {
        // "op info monkey d luffy" → remove "op" and "info", keep "monkey d luffy"
        query = interactionOrMessage.content.split(' ').slice(2).join(' ');
      }
    }

    if (!query) {
      // allowedMentions: { repliedUser: false } prevents the bot from pinging the user
      // on prefix commands (slash commands never ping anyway)
      return interactionOrMessage.reply({ content: 'Please provide a valid card name.', allowedMentions: { repliedUser: false } });
    }

    // Convert to lowercase so the search isn't case-sensitive
    const search = query.toLowerCase();

    // --- STEP 2: Find the card ---
    // Searches by name or alias only (titles are intentionally not searchable)
    const foundCard = cards.find(c =>
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(alias => alias.toLowerCase().includes(search))
    );

    if (!foundCard) {
      return interactionOrMessage.reply({ content: `**${query}** is not a valid card`, allowedMentions: { repliedUser: false } });
    }

    // --- STEP 3: Set up the mastery tracker ---
    // currentMastery tracks which version (M1/M2/M3) is being shown right now.
    // The Previous/Next buttons change this value.
    let currentMastery = 1;

    // --- STEP 5: Helper — build the embed for a given mastery level ---
    // An embed is the fancy card Discord shows with colours, images, and fields.
    // This function is called once when the command first runs, then again each
    // time the user clicks Previous or Next.
    const generateEmbed = (masteryLevel) => {
      // Pick the right stat block: M1 is the base card, M2/M3 are upgraded versions
      let cardData = foundCard;              // defaults to M1
      if (masteryLevel === 2) cardData = foundCard.M2;
      if (masteryLevel === 3) cardData = foundCard.M3;

      // safeRank makes sure we never crash if a card has a typo in its rank field
      const rank = safeRank(cardData.rank);
      if (rank !== cardData.rank) {
        console.warn(`[Info] Card "${foundCard.name}" (M${masteryLevel}) has invalid rank "${cardData.rank}". Displaying with fallback rank D.`);
      }

      // resolveStat converts filter values like '+' or '--' into real numbers.
      // safeStat catches completely broken values so the bot doesn't crash.
      // We pass foundCard.name + masteryLevel so the same card always shows
      // the exact same stat — no matter how many times you press Next/Previous.
      const resolvedPower  = resolveStat(rank, 'power',  safeStat(cardData.power),  foundCard.name, masteryLevel);
      const resolvedHealth = resolveStat(rank, 'health', safeStat(cardData.health), foundCard.name, masteryLevel);
      const resolvedSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  foundCard.name, masteryLevel);

      // Grab the colour and thumbnail icon for this rank + mastery level from rankConfig
      const visual = rankConfig[rank][`M${masteryLevel}`];

      return {
        title: foundCard.name,
        description: [
          `${cardData.title}`,
          ` `,
          `**Rank:** ${cardData.rank}`,
          `**Health:** ${resolvedHealth}`,
          `**Power:** ${resolvedPower}`,
          `**Speed:** ${resolvedSpeed}`,
        ].join('\n'),
        footer: {
          icon_url: user.displayAvatarURL({ dynamic: true }),
          text: `Mastery ${masteryLevel}/3`
        },
        color: visual.color,
        thumbnail: { url: visual.icon },
        image: { url: cardData.image }
      };
    };

    // --- STEP 6: Helper — build the Previous/Next buttons ---
    // Buttons are disabled when they'd go out of bounds (can't go below M1 or above M3)
    const generateButtons = (masteryLevel) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_mastery')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(masteryLevel === 1), // Disable "Previous" when already on M1
        new ButtonBuilder()
          .setCustomId('next_mastery')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(masteryLevel === 3)  // Disable "Next" when already on M3
      );
    };

    // --- STEP 7: Send the initial embed (M1) ---
    // fetchReply: true lets us save the sent message so we can attach a button collector
    const payload = {
      embeds: [generateEmbed(currentMastery)],
      components: [generateButtons(currentMastery)],
      fetchReply: true
    };

    let response;
    if (interactionOrMessage.isChatInputCommand?.()) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // --- STEP 8: Listen for button clicks ---
    // A "collector" watches for button interactions on this message for 60 seconds.
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can click the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      // Reset the 60-second inactivity timer every time the user clicks a button.
      // Without this, the buttons would disappear 60 seconds after the FIRST interaction.
      collector.resetTimer();

      // Move one mastery level up or down depending on which button was clicked
      if (interaction.customId === 'next_mastery') currentMastery++;
      if (interaction.customId === 'prev_mastery') currentMastery--;

      // Update the message with the new mastery's embed and buttons
      await interaction.update({
        embeds: [generateEmbed(currentMastery)],
        components: [generateButtons(currentMastery)]
      });
    });

    // After 60 seconds, remove the buttons so the message stays clean
    collector.on('end', async () => {
      // Keep the card visible, but show that its Previous/Next controls expired.
      // A footer containing only text removes the previous avatar icon.
      try {
        // Fetch the latest mastery embed so the final selected version is preserved.
        const latestResponse = await response.fetch();
        const expiredEmbed = EmbedBuilder
          .from(latestResponse.embeds[0])
          .setFooter({ text: `expired` });

        await latestResponse.edit({ embeds: [expiredEmbed], components: [] });
      } catch {
        // The message may have been deleted while the collector was ending.
      }
    });
  }
};
