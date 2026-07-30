const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { cards, rankConfig, resolveStat } = require('../../data/cards'); // Adjust path if needed!

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Check info about a cards base version')
    .addStringOption(option => 
      option.setName('query').setDescription('Name, title, or alias').setRequired(true)
    ),
    
  name: 'info',
  aliases: ['i'],
  
  async execute(interactionOrMessage, args) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // Get the search text whether they used slash or prefix
    let query = '';
   if (interactionOrMessage.isChatInputCommand?.()) {
      query = interactionOrMessage.options.getString('query');
    } else {
      // If index.js didn't pass 'args', we extract the search term manually
      if (args) {
        query = args.join(' '); 
      } else {
        // This takes "op info luffy", splits it by spaces, removes "op" and "info", and joins the rest!
        query = interactionOrMessage.content.split(' ').slice(2).join(' ');
      }
    }
    if (!query) {
      return interactionOrMessage.reply("Please provide a valid card name.");
    }
    // Convert their search to lowercase for matching
    const search = query.toLowerCase();

    // Find the first card that matches ANY of their text
    const foundCard = cards.find(c => 
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(alias => alias.toLowerCase().includes(search)) ||
      (c.M2 && c.M2.title.toLowerCase().includes(search)) ||
      (c.M3 && c.M3.title.toLowerCase().includes(search))
    );

    if (!foundCard) {
      return interactionOrMessage.reply(`**${query}** is not a valid card.`);
    }
    let currentMastery = 1;
    let ownedAmount = 0; // We will link this to MongoDB later!

    // Helper function to build the embed based on mastery level
    const generateEmbed = (masteryLevel) => {
      let cardData = foundCard; // Defaults to M1 stats
      if (masteryLevel === 2) cardData = foundCard.M2;
      if (masteryLevel === 3) cardData = foundCard.M3;

      // This looks at the specific card's rank (D, C, B, etc.) 
      // AND its current mastery level (M1, M2, M3) to grab the exact visual settings
      const resolvedPower = resolveStat(cardData.rank, 'power', cardData.power);
      const resolvedHealth = resolveStat(cardData.rank, 'health', cardData.health);
      const resolvedSpeed = resolveStat(cardData.rank, 'speed', cardData.speed);
      const visual = rankConfig[cardData.rank][`M${masteryLevel}`];

      return {
        title: foundCard.name,
        description: [
          `${cardData.title}`,
          ` `,
          `**Rank:** ${cardData.rank}`,
          `**Health:** ${resolvedHealth}`,
          `**Power:** ${resolvedPower}`,
          `**Speed:** ${resolvedSpeed}`,
          `**Owned:** ${ownedAmount}`
        ].join('\n'),
        footer: {
            icon_url: user.displayAvatarURL({ dynamic: true }),
             text: `Mastery ${masteryLevel}/3` },
        color: visual.color,
        thumbnail: {
          url: visual.icon // This pulls the Catbox thumbnail link for this specific Mastery!
        },
        image: { url: cardData.image }
      };
    };

    // Helper function to build the Next/Prev buttons
    const generateButtons = (masteryLevel) => {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev_mastery')
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(masteryLevel === 1), 
        new ButtonBuilder()
          .setCustomId('next_mastery')
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(masteryLevel === 3)  
      );
    };

    // Send the default M1 message and save the response to attach the collector
    const payload = {
      embeds: [generateEmbed(currentMastery)],
      components: [generateButtons(currentMastery)],
      fetchReply: true // Important: Allows us to attach the button collector!
    };

    let response;
    if (interactionOrMessage.isChatInputCommand?.()) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // Listen for button clicks for 60 seconds
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      // Prevent other users from clicking the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // Change the mastery level
      if (interaction.customId === 'next_mastery') currentMastery++;
      if (interaction.customId === 'prev_mastery') currentMastery--;

      // Update the original message with the new embed and buttons
      await interaction.update({
        embeds: [generateEmbed(currentMastery)],
        components: [generateButtons(currentMastery)]
      });
    });

    collector.on('end', () => {
      // When 60 seconds pass, remove the buttons so the chat stays clean
      response.edit({ components: [] }).catch(() => {});
    });
  } // <-- This closes the execute() function!
}; // <-- This closes the module.exports!
