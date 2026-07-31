// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// The personal version of /allcards — shows only the cards the user actually owns.
// Each card is shown at the mastery level they've unlocked (based on copy count):
//   1 copy  → Mastery 1
//   2 copies → Mastery 2
//   3+ copies → Mastery 3
//
// This command is to allcards what /mycard is to /info.
//
// Prefix aliases: col, mycards
// Prefix controls:
//   Row 1 — 🔍 (search), Previous, Next
//   Row 2 — Sort dropdown (health / power / speed / rank / copies)
//
// Slash controls: sort and card are options at invocation.
//   /collection              → sorted by copies (default), all owned cards
//   /collection sort:rank    → sorted by rank
//   /collection card:luffy   → jumps straight to Luffy in your collection

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const RANK_ORDER = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

// Labels shown in the footer for each sort mode
const SORT_LABELS = {
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  rank:   'By rank',
  copies: 'By copies'
};

// ─────────────────────────────────────────────
// HELPER — figure out which mastery level the user has unlocked for a card
// Based on how many copies they own: 1 = M1, 2 = M2, 3+ = M3
// ─────────────────────────────────────────────
function getOwnedMastery(amount) {
  return Math.min(amount, 3);
}

// ─────────────────────────────────────────────
// HELPER — get the right stat block for a card at a given mastery level
// Falls back gracefully if M2 or M3 data is missing
// ─────────────────────────────────────────────
function getCardData(card, mastery) {
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card; // M1 is always the base card
}

// ─────────────────────────────────────────────
// HELPER — resolve a single stat for a card at a given mastery
// ─────────────────────────────────────────────
function resolveCardStat(card, mastery, statType) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);
  return resolveStat(rank, statType, safeStat(cardData[statType]), card.name, mastery);
}

// ─────────────────────────────────────────────
// HELPER — sort the owned-card list
// Each entry in ownedList is: { card, mastery, copies }
// ─────────────────────────────────────────────
function sortOwnedCards(ownedList, sortMode) {
  const copy = [...ownedList];

  if (sortMode === 'copies') {
    // Most copies first — the default for a personal collection
    return copy.sort((a, b) => b.copies - a.copies);
  }

  if (sortMode === 'rank') {
    return copy.sort((a, b) => {
      const rankA = safeRank(getCardData(a.card, a.mastery).rank || a.card.rank);
      const rankB = safeRank(getCardData(b.card, b.mastery).rank || b.card.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  }

  // health, power, speed — sort by the stat at the user's owned mastery level
  return copy.sort((a, b) => {
    return resolveCardStat(b.card, b.mastery, sortMode) - resolveCardStat(a.card, a.mastery, sortMode);
  });
}

// ─────────────────────────────────────────────
// HELPER — build the embed for one owned card
// Looks just like /mycard: shows copies and uses owned mastery visuals
// ─────────────────────────────────────────────
function buildCardEmbed(entry, footerText, user) {
  const { card, mastery, copies } = entry;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  // Log a warning if the rank value is invalid (so the owner can fix card data)
  if (rank !== (cardData.rank || card.rank)) {
    console.warn(`[Collection] "${card.name}" M${mastery} has invalid rank "${cardData.rank}". Using fallback D.`);
  }

  const visual = rankConfig[rank][`M${mastery}`];
  const health = resolveStat(rank, 'health', safeStat(cardData.health), card.name, mastery);
  const power  = resolveStat(rank, 'power',  safeStat(cardData.power),  card.name, mastery);
  const speed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  card.name, mastery);

  return {
    title: card.name,
    description: [
      `${cardData.title}`,
      ` `,
      `**Rank:** ${cardData.rank || card.rank}`,
      `**Health:** ${health}`,
      `**Power:** ${power}`,
      `**Speed:** ${speed}`,
      `**Copies:** ${copies}`
    ].join('\n'),
    footer: {
      icon_url: user.displayAvatarURL({ dynamic: true }),
      text: footerText
    },
    color: visual.color,
    thumbnail: { url: visual.icon },
    image: { url: cardData.image }
  };
}

// ─────────────────────────────────────────────
// HELPER — normal-mode footer text
// Example: "Card 3/12 - By copies"
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'}`;
}

// ─────────────────────────────────────────────
// HELPER — search-mode footer text
// Example: "Card 1/1 - [Monkey D. Luffy]"
// ─────────────────────────────────────────────
function searchFooter(cardName) {
  return `Card 1/1 - [${cardName}]`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
// PREFIX: 2 rows — nav+search buttons, sort dropdown
// SLASH:  1 row  — nav+search buttons only (sort is a slash option)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, isSlash) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to find a specific card
    new ButtonBuilder()
      .setCustomId('col_search')
      .setLabel('🔍')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('col_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('col_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= total - 1)
  );

  // Slash users set sort via command options, so they don't need a dropdown mid-session
  if (isSlash) return [navRow];

  const sortRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('col_sort')
      .setPlaceholder('Sort by...')
      .addOptions([
        { label: 'By copies', value: 'copies', default: sortMode === 'copies' },
        { label: 'By health', value: 'health', default: sortMode === 'health' },
        { label: 'By power',  value: 'power',  default: sortMode === 'power'  },
        { label: 'By speed',  value: 'speed',  default: sortMode === 'speed'  },
        { label: 'By rank',   value: 'rank',   default: sortMode === 'rank'   }
      ])
  );

  return [navRow, sortRow];
}

// ─────────────────────────────────────────────
// HELPER — components for search mode
// Just a red Back button — only one card is shown (the one the user found)
// ─────────────────────────────────────────────
function buildSearchComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('col_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/collection)
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription("Browse your owned cards at the mastery level you've unlocked.")
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('How to sort your collection (default: by copies)')
        .setRequired(false)
        .addChoices(
          { name: 'By copies', value: 'copies' },
          { name: 'By health', value: 'health' },
          { name: 'By power',  value: 'power'  },
          { name: 'By speed',  value: 'speed'  },
          { name: 'By rank',   value: 'rank'   }
        )
    )
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('Jump to a specific card in your collection')
        .setRequired(false)
    ),

  // Prefix command definition
  name: 'collection',
  aliases: ['col', 'mycards'],

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options ──
    let initialSort       = 'copies'; // Default sort for a personal collection
    let initialCardFilter = null;

    if (isSlash) {
      const sortOption = interactionOrMessage.options.getString('sort');
      const cardOption = interactionOrMessage.options.getString('card');
      if (sortOption) initialSort       = sortOption;
      if (cardOption) initialCardFilter = cardOption;
    }

    // ── STEP 2: Load the user's owned cards from the database ──
    const userData = await User.findOne({ userId: user.id });

    // Build a rich list of owned cards: each entry holds the card object,
    // their unlocked mastery level, and their copy count
    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue; // Skip cards with 0 copies (shouldn't happen, but safe)
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue; // Skip any cards that no longer exist in the card library
      ownedList.push({
        card,
        mastery: getOwnedMastery(entry.amount), // 1, 2, or 3
        copies:  entry.amount
      });
    }

    // If the user has no cards at all, tell them (no ping on prefix)
    if (ownedList.length === 0) {
      return interactionOrMessage.reply({
        content: "You don't own any cards yet. Use `op pull` to get some!",
        allowedMentions: { repliedUser: false }
      });
    }

    // ── STEP 3: Set up state ──
    let sortMode     = initialSort;
    let currentPage  = 0;
    let isSearchMode = false;
    let searchEntry  = null; // The single card entry shown in search mode

    // Apply the initial sort to the full owned list
    let sortedList = sortOwnedCards(ownedList, sortMode);

    // If a card filter was provided via slash option, immediately enter search mode
    if (initialCardFilter) {
      const query = initialCardFilter.toLowerCase().trim();
      const found = ownedList.find(e =>
        e.card.name.toLowerCase().includes(query) ||
        e.card.aliases.some(a => a && a.toLowerCase().includes(query))
      );

      if (!found) {
        return interactionOrMessage.reply({
          content: `You don't own a card matching **${initialCardFilter}**.`,
          allowedMentions: { repliedUser: false }
        });
      }

      isSearchMode = true;
      searchEntry  = found;
    }

    // ── STEP 4: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      embed      = buildCardEmbed(searchEntry, searchFooter(searchEntry.card.name), user);
      components = buildSearchComponents();
    } else {
      embed      = buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user);
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash);
    }

    // ── STEP 5: Send the initial message ──
    // fetchReply: true gives us back the message object so we can attach a collector
    const payload = { embeds: [embed], components, fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 6: Set up the button/dropdown collector ──
    // Watches for any interaction on this message for 2 minutes
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can use the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // ── NEXT ──
      if (interaction.customId === 'col_next') {
        currentPage = Math.min(sortedList.length - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'col_prev') {
        currentPage = Math.max(0, currentPage - 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0;
        // Re-sort the owned list with the new mode.
        // We re-use the original ownedList (not re-fetching DB) — copies don't
        // change mid-session often enough to matter here.
        sortedList = sortOwnedCards(ownedList, sortMode);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SEARCH BUTTON (🔍) ──
      // Opens a modal popup where the user types the name of a card they own
      else if (interaction.customId === 'col_search') {
        const modal = new ModalBuilder()
          .setCustomId('col_search_modal')
          .setTitle('Search your collection')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('col_search_query')
                .setLabel('Card name or alias')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);

        // Wait up to 30 seconds for the user to submit the modal
        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'col_search_modal' && i.user.id === user.id
          });

          const query = submit.fields.getTextInputValue('col_search_query').toLowerCase().trim();

          // Search only within the user's owned cards
          const found = ownedList.find(e =>
            e.card.name.toLowerCase().includes(query) ||
            e.card.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            // Card not in their collection — ephemeral error, embed stays unchanged
            await submit.reply({ content: `You don't own a card matching **${query}**.`, flags: 64 });
            return;
          }

          // Enter search mode: show only this one card
          isSearchMode = true;
          searchEntry  = found;

          await submit.update({
            embeds:     [buildCardEmbed(searchEntry, searchFooter(searchEntry.card.name), user)],
            components: buildSearchComponents()
          });

        } catch {
          // Modal was dismissed or timed out — do nothing
        }
      }

      // ── BACK BUTTON — exit search mode and return to the sorted collection ──
      else if (interaction.customId === 'col_back') {
        isSearchMode = false;
        searchEntry  = null;
        currentPage  = 0;
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }
    });

    // After 2 minutes, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
