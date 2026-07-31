const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

// The User model lets us read and update the player's balance and claim timestamp
const User = require('../../models/user');

// How many Berries the player earns per daily claim
const DAILY_REWARD = 1000;

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Berries reward.'),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'daily',
  aliases: ['d'],
  description: 'Claim your daily rewards.',

  async execute(interactionOrMessage) {
    const user   = interactionOrMessage.author || interactionOrMessage.user;
    const userId = user.id;

    // Helper: send an embed for both slash and prefix commands without repeating code
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

    // Load the user's save data from MongoDB
    let userData = await User.findOne({ userId });
    if (!userData) {
      // This shouldn't happen (index.js creates the account first), but just in case:
      userData = new User({ userId });
    }

    const now      = new Date();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Check if the player has already claimed today
    if (userData.lastDailyClaim && (now - userData.lastDailyClaim) < cooldown) {
      const remainingMs    = cooldown - (now - userData.lastDailyClaim);
      const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
      const remainingMins  = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

      const cooldownEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setDescription(
          `You already claimed your daily! Come back in **${remainingHours}h ${remainingMins}m**.`
        );

      return sendMessage(cooldownEmbed);
    }

    // Award the daily Berries and update the claim timestamp
    userData.balance      += DAILY_REWARD;
    userData.lastDailyClaim = now;
    await userData.save();

    // Format the new balance with commas for display (e.g. 2500 → "2,500")
    const newBalance = userData.balance.toLocaleString('en-US');

    const successEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Daily Claimed!')
      .setDescription(
        `<:whitearrow:1532531439445344547> You received **${DAILY_REWARD.toLocaleString('en-US')}** <:money:1532532493578928178> Berries!\n` +
        `<:whitearrow:1532531439445344547> New balance: **${newBalance}** <:money:1532532493578928178>\n\n` +
        `Next claim available in **24 hours**.`
      );

    await sendMessage(successEmbed);
  }
};
