// ─────────────────────────────────────────────
// INVENTORY COMMAND
// ─────────────────────────────────────────────
// Shows the player's current item counts in one simple list. Categories are
// intentionally not included yet, so there is no dropdown on this message.

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');

const DISPLAYED_ITEMS = [
  INVENTORY_ITEMS.meat,
  INVENTORY_ITEMS.wine,
  INVENTORY_ITEMS.beer
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Check your item inventory'),

  name: 'inventory',
  aliases: ['inv'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const userData = await User.findOne({ userId: user.id });

    const itemLines = DISPLAYED_ITEMS.map(item => {
      const amount = Number(userData?.[item.field]) || 0;
      return `${item.emoji} **${item.name}** (${amount.toLocaleString('en-US')})`;
    });

    const embed = {
      title: `${user.username}'s Inventory`,
      description: itemLines.join('\n'),
      thumbnail: {
        url: user.displayAvatarURL({ extension: 'png', size: 128 })
      },
      color: 0x8e44ad
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      return interactionOrMessage.reply({ embeds: [embed] });
    }

    return interactionOrMessage.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [], repliedUser: false }
    });
  }
};