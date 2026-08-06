const { SlashCommandBuilder } = require('discord.js');

// The User model lets us look up how many berries and meat the player has
const User = require('../../models/user');

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription("Check your balance"),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'balance',
  aliases: ['bal', 'wallet'],

  async execute(interactionOrMessage) {
    // Works for both /balance (slash) and "op balance" (prefix)
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // Look up the user's save data in MongoDB
    const userData = await User.findOne({ userId: user.id });

    // If somehow they have no data yet, default to 0 for both currencies
    const berries = userData?.balance ?? 0;
    const meat    = userData?.meat    ?? 0;

    // toLocaleString formats numbers with commas: 2500 → "2,500"
    const berriesFormatted = berries.toLocaleString('en-US');
    const meatFormatted    = meat.toLocaleString('en-US');

    // Build the embed object
    // The whitearrow emoji acts as a bullet point before each line
    const embed = {
      title: `${user.username}'s Balance`,
      description:
        `<:whitearrow:1532531439445344547> Berries: **${berriesFormatted}** <:SilverCoin:1534757841867374782>\n` +
        `<:whitearrow:1532531439445344547> Meat: **${meatFormatted}** <:Ham:1534995152605548585>`,
      thumbnail: { url: user.displayAvatarURL({ dynamic: true }) },
      color: 0xFFFFFF
    };

    // Send the embed — works for both slash and prefix commands
    if (interactionOrMessage.isChatInputCommand?.()) {
      await interactionOrMessage.reply({ embeds: [embed] });
    } else {
      await interactionOrMessage.channel.send({ embeds: [embed] });
    }
  }
};
