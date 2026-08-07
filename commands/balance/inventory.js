// ─────────────────────────────────────────────
// INVENTORY COMMAND
// ─────────────────────────────────────────────
// The dropdown switches between ordinary items and Clone items. The command
// user owns the message, so other users cannot change their inventory view.

const {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS, CLONE_RANKS } = require('../../data/inventoryItems');
const { rankEmojis } = require('../../data/cards');
const RAID_BOSSES = require('../../data/raids');
const { isLeaderNow } = require('../../utils/leadership');
const { claimInteractionLock } = require('../../utils/interactionLock');

const BASIC_ITEMS = [
  INVENTORY_ITEMS.chest,
  INVENTORY_ITEMS.crate,
  INVENTORY_ITEMS.gem,
  INVENTORY_ITEMS.meat,
  INVENTORY_ITEMS.wine,
  INVENTORY_ITEMS.beer
];

// Raid items are always visible as a group: Silver and Iron keys, plus any
// Golden raid keys the player has bought. Golden keys are looked up per raid.
const RAID_ITEMS = [
  INVENTORY_ITEMS.silverKey,
  INVENTORY_ITEMS.ironKey
];

const BASIC_VIEW = 'basic';
const CLONES_VIEW = 'clones';
const RAID_VIEW = 'raid';
const INVENTORY_VIEW_ID = 'inventory_view';
const VIEW_COLLECTOR_TIME_MS = 300000;

function getCloneItems() {
  return CLONE_RANKS.map(rank => ({
    ...INVENTORY_ITEMS[`clone${rank}`],
    emoji: rankEmojis[rank]
  }));
}

function getItemsForView(view) {
  if (view === CLONES_VIEW) return getCloneItems();
  if (view === RAID_VIEW) return RAID_ITEMS;
  return BASIC_ITEMS;
}

// Build the description lines for the current view. The raid view also lists
// every Golden key the player owns, naming the raid it was bought for.
function buildItemLines(userData, view) {
  if (view === RAID_VIEW) {
    const lines = RAID_ITEMS
      .map(item => {
        const amount = Number(userData?.[item.field]) || 0;
        if (amount < 1) return null;
        return `${item.emoji} **${item.name}** (${amount.toLocaleString('en-US')})`;
      })
      .filter(Boolean);

    // Show each owned Golden key with its raid name (e.g. "Luffy M3 Gold Key").
    for (const owned of userData?.goldKeys || []) {
      const boss = RAID_BOSSES.find(b => b.id === owned.raidId);
      if (!boss) continue;
      lines.push(
        `${INVENTORY_ITEMS.goldKey.emoji} **${boss.cardName} M${boss.mastery} Gold Key**`
      );
    }

    if (lines.length > 0) return lines.join('\n');
    return 'You do not own any Raid items';
  }

  return getItemsForView(view)
    .map(item => {
      const amount = Number(userData?.[item.field]) || 0;
      if (amount < 1) return null;
      return `${item.emoji} **${item.name}** (${amount.toLocaleString('en-US')})`;
    })
    .filter(Boolean)
    .join('\n') || (view === CLONES_VIEW
      ? 'You do not own any Clones'
      : 'Your basic inventory is empty');
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
        new StringSelectMenuOptionBuilder()
          .setLabel('Basic Items')
          .setValue(BASIC_VIEW)
          .setDescription('View your basic items')
          .setEmoji({ name: 'Ham', id: '1534995152605548585' })
          .setDefault(view === BASIC_VIEW),
        new StringSelectMenuOptionBuilder()
          .setLabel('Clones')
          .setValue(CLONES_VIEW)
          .setDescription('View your Clone items')
          .setEmoji({ name: 'A1', id: '1532809220729208942' })
          .setDefault(view === CLONES_VIEW),
        new StringSelectMenuOptionBuilder()
          .setLabel('Raid items')
          .setValue(RAID_VIEW)
          .setDescription('View your raid keys')
          .setEmoji({ name: 'IronKey', id: '1534757764398579722' })
          .setDefault(view === RAID_VIEW)
      ])
  );
}

function buildPayload(user, userData, view) {
  return {
    embeds: [buildEmbed(user, userData, view)],
    components: [buildViewRow(view)],
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
    let currentView = BASIC_VIEW;
    const payload = buildPayload(user, userData, currentView);

    const activeMessage = isSlash
      ? (await interactionOrMessage.reply({ ...payload, withResponse: true }), await interactionOrMessage.fetchReply())
      : await interactionOrMessage.channel.send(payload);

    if (!activeMessage) return;

    const collector = activeMessage.createMessageComponentCollector({
      componentType: 3,
      time: VIEW_COLLECTOR_TIME_MS
    });

    collector.on('collect', async interaction => {
      // Only the newest/main deploy may handle this click.
      if (!isLeaderNow()) return;
      if (!(await claimInteractionLock(interaction.id))) return;

      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: "This isn't your inventory",
          flags: 64,
          allowedMentions: { parse: [] }
        });
      }

      if (interaction.customId !== INVENTORY_VIEW_ID) return;

      try {
        const selectedValue = interaction.values?.[0];
        const selectedView = selectedValue === CLONES_VIEW
          ? CLONES_VIEW
          : selectedValue === RAID_VIEW
            ? RAID_VIEW
            : BASIC_VIEW;
        currentView = selectedView;
        const freshData = await User.findOne({ userId: user.id });
        await interaction.update(buildPayload(user, freshData, currentView));
      } catch (error) {
        if (
          error.code === 40060 ||
          error.code === 10062 ||
          error.message?.includes('already been acknowledged') ||
          error.message?.includes('Unknown interaction')
        ) {
          return;
        }
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
      const disabledRow = buildViewRow(currentView);
      disabledRow.components[0].setDisabled(true);
      activeMessage.edit({
        components: [disabledRow],
        allowedMentions: { parse: [], repliedUser: false }
      }).catch(() => {});
    });
  }
};