const { SlashCommandBuilder } = require('discord.js');
// Import the card pool and the visual settings
// Adjust this path based on where pull.js is relative to your data folder!
const { cards, rankConfig, resolveStat } = require('../../data/cards'); 

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pull')
    .setDescription('Pull a random card.'),

  name: 'pull',
  aliases: ['p'],
  description: 'Pull a random card.',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // 1. Pick a random card from the library
    // Math.random() picks a decimal between 0 and 1. We multiply it by the amount of cards
    // and use Math.floor() to round down, giving us a random valid index (0, 1, 2, etc.)
    const pulledCard = cards[Math.floor(Math.random() * cards.length)];

    // 2. Grab the visual settings for this card's Base (M1) rank
    // If the card is rank 'B', this grabs rankConfig['B'].M1
    const visualSettings = rankConfig[pulledCard.rank].M1;

    // 3. Build the embed dynamically using the pulled card's M1 stats
    const resolvedPower = resolveStat(pulledCard.rank, 'power', pulledCard.power);
    const resolvedHealth = resolveStat(pulledCard.rank, 'health', pulledCard.health);
    const resolvedSpeed = resolveStat(pulledCard.rank, 'speed', pulledCard.speed);
    
    const embed = {
      title: pulledCard.name,
      description: [
        `${pulledCard.title}`,
        ``,
        `**Health:** ${resolvedHealth}`,
        `**Power:** ${resolvedPower}`,
        `**Speed:** ${resolvedSpeed}`
      ].join('\n'),
      thumbnail: {
        // Using the link you put in the rankConfig for this rank
        url: visualSettings.icon,
      },
      // Using the color you put in the rankConfig for this rank
      color: visualSettings.color,
      footer: { text: `This card was pulled by ${user.username}` },
      image: { 
        // Using the image link from the card itself
        url: pulledCard.image 
      }
    };

    // 4. Send the embed (your existing handling logic)
    if (interactionOrMessage.isChatInputCommand?.()) {
      if (interactionOrMessage.replied || interactionOrMessage.deferred) {
        await interactionOrMessage.followUp({ embeds: [embed] });
      } else {
        await interactionOrMessage.reply({ embeds: [embed] });
      }
    } else {
      await interactionOrMessage.channel.send({ embeds: [embed] });
    }
  },
};