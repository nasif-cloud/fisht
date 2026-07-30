const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// Make sure to adjust this relative path to match where your User model is located!
const User = require('../../models/user');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily rewards.'),

  name: 'daily',
  aliases: ['d'],
  description: 'Claim your daily rewards.',

  async execute(interactionOrMessage) {
    // 1. Get the user who ran the command
    const user = interactionOrMessage.author || interactionOrMessage.user;
    const userId = user.id;

    // Helper function to send messages for both slash & prefix commands
    const sendMessage = async (embed) => {
      if (interactionOrMessage.isChatInputCommand?.()) {
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
          await interactionOrMessage.followUp({ embeds: [embed] });
        } else {
          await interactionOrMessage.reply({ embeds: [embed] });
        }
      } else {
        await interactionOrMessage.channel.send({ embeds: [embed] });
      }
    };

    // 2. Fetch or create the user's data in MongoDB
    let userData = await User.findOne({ userId: userId });
    if (!userData) {
      userData = await User.create({ userId: userId, balance: 0 });
    }

    const now = new Date();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours in ms

    // 3. Check if user is still on cooldown
    if (userData.lastDailyClaim && (now - userData.lastDailyClaim) < cooldown) {
      const remainingMs = cooldown - (now - userData.lastDailyClaim);
      const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));

      const cooldownEmbed = new EmbedBuilder()
        .setColor(0xffffff)
        .setDescription(`You already claimed your daily! Wait **${remainingHours}** hours.`);

      return await sendMessage(cooldownEmbed);
    }

    // 4. Update MongoDB balance and lastDailyClaim timestamp
    userData.balance += 1000;
    userData.lastDailyClaim = now;
    await userData.save();

    // 5. Send success response
    const embed = new EmbedBuilder()
      .setColor(0xffffff)
      .setTitle('Claimed Daily Rewards')
      .setDescription('You receive 1,000 berries!\n Next claim in `24 hours`');

    await sendMessage(embed);
  }
};