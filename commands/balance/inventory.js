// ─────────────────────────────────────────────
// INVENTORY COMMAND
// ─────────────────────────────────────────────
// The dropdown switches between ordinary items and Clone items. The command
// user owns the message, so other users cannot change their inventory view.

const {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder
} = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS, CLONE_RANKS } = require('../../data/inventoryItems');
const { rankEmojis } = require('../../data/cards');

const BASIC_ITEMS = [
  INVENTORY_ITEMS.chest,
  INVENTORY_ITEMS.crate,
  INVENTORY_ITEMS.gem,
  INVENTORY_ITEMS.meat,
  INVENTORY_ITEMS.wine,
  INVENTORY_ITEMS.beer
];

const BASIC_VIEW = 'basic';
const CLONES_VIEW = 'clones';
const INVENTORY_VIEW_ID = 'inventory_view';
const VIEW_COLLECTOR_TIME_MS = 300000;

function getCloneItems() {
  return CLONE_RANKS.map(rank => ({
    ...INVENTORY_ITEMS[`clone${rank}`],
    emoji: rankEmojis[rank]
  }));
}

function getItemsForView(view) {
  return view === CLONES_VIEW ? getCloneItems() : BASIC_ITEMS;
}

function buildItemLines(userData, view) {
  const lines = getItemsForView(view)
    .map(item => {
      const amount = Number(userData?.[item.field]) || 0;
      if (amount < 1) return null;
      return `${item.emoji} **${item.name}** (${amount.toLocaleString('en-US')})`;
    })
    .filter(Boolean);

  if (lines.length > 0) return lines.join('\n');
  return view === CLONES_VIEW
    ? 'You do not own any Clones'
    : 'Your basic inventory is empty';
}

function buildEmbed(user, userData, view) {
  return {
    title: `${user.username}'s Inventory`,
    description: buildItemLines(userData, view),
    thumbnail: {
      url: user.displayAvatarURL({ extension: 'png', size: 128 })
    },
    color: 0xEB0000
  };
}

function buildViewRow(view) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(INVENTORY_VIEW_ID)
      .setPlaceholder('Choose inventory category')
      .addOptions([
        {
          label: 'Basic Items',
          value: BASIC_VIEW,
          description: 'View your basic items',
          emoji: { name: 'Ham', id: '1534995152605548585' },
          default: view === BASIC_VIEW
        },
        {
          label: 'Clones',
          value: CLONES_VIEW,
          description: 'View your Clone items',
          emoji: { name: 'A1', id: '1532809220729208942' },
          default: view === CLONES_VIEW
        }
      ])
  );
}

function buildPayload(user, userData, view, fetchReply = false) {
  return {
    embeds: [buildEmbed(user, userData, view)],
    components: [buildViewRow(view)],
    fetchReply,
    allowedMentions: { parse: [], repliedUser: false }
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Check your item inventory'),

  name: 'inventory',
  aliases: ['inv'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const userData = await User.findOne({ userId: user.id });
    const payload = buildPayload(user, userData, BASIC_VIEW, true);

    const response = isSlash
      ? await interactionOrMessage.reply(payload)
      : await interactionOrMessage.channel.send(payload);

    const collector = response.createMessageComponentCollector({
      componentType: 3,
      time: VIEW_COLLECTOR_TIME_MS
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: "This isn't your inventory",
          flags: 64,
          allowedMentions: { parse: [] }
        });
      }

      if (interaction.customId !== INVENTORY_VIEW_ID) return;

      try {
        const selectedView = interaction.values?.[0] === CLONES_VIEW
          ? CLONES_VIEW
          : BASIC_VIEW;
        const freshData = await User.findOne({ userId: user.id });
        await interaction.update(buildPayload(user, freshData, selectedView));
      } catch (error) {
        console.error('[Inventory] Dropdown update failed:', error.message);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'I could not update your inventory right now',
            flags: 64,
            allowedMentions: { parse: [] }
          }).catch(() => {});
        }
      }
    });

    collector.on('end', () => {
      const disabledRow = buildViewRow(BASIC_VIEW);
      disabledRow.components[0].setDisabled(true);
      response.edit({
        components: [disabledRow],
        allowedMentions: { parse: [], repliedUser: false }
      }).catch(() => {});
    });
  }
};