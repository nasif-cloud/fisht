// ─────────────────────────────────────────────
// INVENTORY COMMAND
// ─────────────────────────────────────────────
// Shows the player's current item counts in one simple list. Chests stay first
// whenever the player owns them, followed by usable items and Clone ranks.

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS, CLONE_RANKS } = require('../../data/inventoryItems');
const { rankEmojis } = require('../../data/cards');

const DISPLAYED_ITEMS = [
  INVENTORY_ITEMS.chest,
  INVENTORY_ITEMS.meat,
  INVENTORY_ITEMS.wine,
  INVENTORY_ITEMS.beer,
  ...CLONE_RANKS.map(rank => ({
    ...INVENTORY_ITEMS[`clone${rank}`],
    emoji: rankEmojis[rank]
  }))
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

    // Do not show empty slots. This keeps the inventory focused on items the
    // player can actually use right now.
    const itemLines = DISPLAYED_ITEMS
      .map(item => {
      const amount = Number(userData?.[item.field]) || 0;
      return amount > 0
        ? `${item.emoji} **${item.name}** (${amount.toLocaleString('en-US')})`
        : null;
      })
      .filter(Boolean);

    const embed = {
      title: `${user.username}'s Inventory`,
      description: itemLines.length > 0
        ? itemLines.join('\n')
        : 'Your inventory is empty',
      thumbnail: {
        url: user.displayAvatarURL({ extension: 'png', size: 128 })
      },
      color: 0xEB0000
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