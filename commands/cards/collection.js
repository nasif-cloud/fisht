// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// The personal version of /allcards — shows only the cards the user owns.
// Mastery is a view setting (M1 / M2 / M3), NOT derived from copy count.
// A Copies field is added to every card embed.
//
// Prefix aliases: col, mycards
// Prefix controls:
//   Row 1 — 🔍 (search), Previous, Next
//   Row 2 — Sort dropdown (copies / health / power / speed / rank)
//   Row 3 — Mastery dropdown (M1's / M2's / M3's)
//
// Slash controls: sort, mastery, and card are options at invocation.
//   /collection                          → sorted by copies, M1 view
//   /collection sort:rank mastery:M2     → sorted by rank, M2 view
//   /collection card:luffy               → jump to Luffy (cannot combine with sort/mastery)
//
// Search mode (🔍 button or card slash option):
//   Shows one owned card; Prev/Next cycles M1 → M2 → M3 (like /allcards search mode).
//   A red Back button returns to the sorted list.

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

// Human-readable label for each sort mode, used in the embed footer
const SORT_LABELS = {
  copies: 'By copies',
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  rank:   'By rank'
};

// ─────────────────────────────────────────────
// HELPER — get the stat block for a card at a given mastery level
// Falls back gracefully if M2/M3 data is missing on that card
// ─────────────────────────────────────────────
function getCardData(card, mastery) {
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card; // M1 always uses the base card object
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
// HELPER — sort an owned-card list
// Each entry in ownedList is: { card, copies }
// Stat-based sorts use the currently selected mastery view level
// ─────────────────────────────────────────────
function sortOwnedCards(ownedList, sortMode, mastery) {
  const copy = [...ownedList]; // Don't mutate the original

  if (sortMode === 'copies') {
    // Most copies first — the natural default for a personal collection
    return copy.sort((a, b) => b.copies - a.copies);
  }

  if (sortMode === 'rank') {
    return copy.sort((a, b) => {
      const rankA = safeRank(getCardData(a.card, mastery).rank || a.card.rank);
      const rankB = safeRank(getCardData(b.card, mastery).rank || b.card.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  }

  // health, power, speed — sort by the stat at the selected mastery view
  return copy.sort((a, b) => {
    return resolveCardStat(b.card, mastery, sortMode) - resolveCardStat(a.card, mastery, sortMode);
  });
}

// ─────────────────────────────────────────────
// HELPER — build the embed for one owned card
// Shows stats at the selected mastery view level, plus a Copies field
// ─────────────────────────────────────────────
function buildCardEmbed(entry, mastery, footerText, user) {
  const { card, copies } = entry;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  // Log a warning if the rank value is invalid so the owner can find and fix it
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
      `**Copies:** ${copies}` // Always shows the real copy count, regardless of mastery view
    ].join('\n'),
    footer: {
      icon_url: user.displayAvatarURL({ dynamic: true }),
      text: footerText
    },
    color:     visual.color,
    thumbnail: { url: visual.icon },
    image:     { url: cardData.image }
  };
}

// ─────────────────────────────────────────────
// HELPER — normal-mode footer text
// Example: "Card 3/12 - By copies [M1's]"
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode, mastery) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'} [M${mastery}'s]`;
}

// ─────────────────────────────────────────────
// HELPER — search-mode footer text
// Example: "Card 2/3 - [Monkey D. Luffy]"
// (The number shows which mastery is being viewed out of 3)
// ─────────────────────────────────────────────
function searchFooter(searchMastery, cardName) {
  return `Card ${searchMastery}/3 - [${cardName}]`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
// PREFIX: 3 rows — nav buttons, sort dropdown, mastery dropdown
// SLASH:  1 row  — nav buttons only (sort/mastery are set at invocation)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, mastery, isSlash) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to find a specific owned card
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

  // Slash users set sort/mastery via command options — no dropdowns needed mid-session
  if (isSlash) return [navRow];

  // PREFIX: add sort and mastery dropdowns below the nav buttons
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

  const masteryRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('col_mastery')
      .setPlaceholder('Mastery view...')
      .addOptions([
        { label: "Only M1's", value: '1', default: mastery === 1 },
        { label: "Only M2's", value: '2', default: mastery === 2 },
        { label: "Only M3's", value: '3', default: mastery === 3 }
      ])
  );

  return [navRow, sortRow, masteryRow];
}

// ─────────────────────────────────────────────
// HELPER — components for search (single-card) mode
// Back button (red) + Prev/Next to cycle through M1 → M2 → M3
// ─────────────────────────────────────────────
function buildSearchComponents(searchMastery) {
  return [
    new ActionRowBuilder().addComponents(
      // Back returns to the sorted collection list
      new ButtonBuilder()
        .setCustomId('col_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('col_prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(searchMastery === 1), // Can't go before M1
      new ButtonBuilder()
        .setCustomId('col_next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(searchMastery === 3)  // Can't go past M3
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
    .setDescription("Browse the cards you own at any mastery view level.")
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('How to sort your collection (default: by copies) — cannot use with card')
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
        .setName('mastery')
        .setDescription('Which mastery level to view (default: M1) — cannot use with card')
        .setRequired(false)
        .addChoices(
          { name: "Only M1's", value: '1' },
          { name: "Only M2's", value: '2' },
          { name: "Only M3's", value: '3' }
        )
    )
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('Jump to a specific card you own (cannot be used with sort or mastery)')
        .setRequired(false)
    ),

  // Prefix command definition
  name: 'collection',
  aliases: ['col', 'mycards'],

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options ──
    let slashSort    = null;
    let slashMastery = null;
    let slashCard    = null;

    if (isSlash) {
      slashSort    = interactionOrMessage.options.getString('sort');
      slashMastery = interactionOrMessage.options.getString('mastery');
      slashCard    = interactionOrMessage.options.getString('card');

      // 'card' can't be combined with sort or mastery — same rule as /allcards
      if (slashCard && (slashSort || slashMastery)) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort** or **mastery**. Pick one.',
          flags: 64 // Ephemeral — only the user sees this error
        });
      }
    }

    // ── STEP 2: Load the user's owned cards from the database ──
    const userData = await User.findOne({ userId: user.id });

    // Build a list of owned cards: each entry holds the card object and copy count.
    // Mastery is NOT stored here — it is a view setting chosen by the user.
    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue; // Skip zero-copy entries (safety guard)
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue; // Skip cards that no longer exist in the card library
      ownedList.push({
        card,
        copies: entry.amount
      });
    }

    // If the user has no cards at all, tell them (no ping on prefix)
    if (ownedList.length === 0) {
      return interactionOrMessage.reply({
        content: "You don't own any cards yet. Use `op pull` to get some!",
        allowedMentions: { repliedUser: false }
      });
    }

    // ── STEP 3: Set up initial state ──
    let sortMode      = slashSort    || 'copies';       // Default sort: by copies
    let mastery       = parseInt(slashMastery) || 1;    // Default view: M1
    let currentPage   = 0;
    let isSearchMode  = false;
    let searchEntry   = null; // The single owned card shown in search mode
    let searchMastery = 1;    // Which mastery (1/2/3) is active in search mode

    // Apply the initial sort to the owned list
    let sortedList = sortOwnedCards(ownedList, sortMode, mastery);

    // ── STEP 4: Handle 'card' option / enter search mode immediately ──
    if (slashCard) {
      const query = slashCard.toLowerCase().trim();
      const found = ownedList.find(e =>
        e.card.name.toLowerCase().includes(query) ||
        e.card.aliases.some(a => a && a.toLowerCase().includes(query))
      );

      if (!found) {
        return interactionOrMessage.reply({
          content: `You don't own a card matching **${slashCard}**.`,
          allowedMentions: { repliedUser: false }
        });
      }

      isSearchMode  = true;
      searchEntry   = found;
      searchMastery = 1; // Always start at M1 in search mode
    }

    // ── STEP 5: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      embed      = buildCardEmbed(searchEntry, searchMastery, searchFooter(searchMastery, searchEntry.card.name), user);
      components = buildSearchComponents(searchMastery);
    } else {
      embed      = buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user);
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash);
    }

    // ── STEP 6: Send the initial message ──
    // fetchReply: true gives us back the message object so we can attach a collector
    const payload = { embeds: [embed], components, fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 7: Set up the button/dropdown collector ──
    // Watches for any interaction on this message for 2 minutes
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can use the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // ── NEXT ──
      if (interaction.customId === 'col_next') {
        if (isSearchMode) {
          // In search mode: cycle forward through M1 → M2 → M3
          searchMastery = Math.min(3, searchMastery + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchEntry, searchMastery, searchFooter(searchMastery, searchEntry.card.name), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.min(sortedList.length - 1, currentPage + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash)
          });
        }
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'col_prev') {
        if (isSearchMode) {
          // In search mode: cycle backward through M3 → M2 → M1
          searchMastery = Math.max(1, searchMastery - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchEntry, searchMastery, searchFooter(searchMastery, searchEntry.card.name), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.max(0, currentPage - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash)
          });
        }
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0; // Reset to first card when sort changes
        // Re-sort the owned list with the new mode, using the current mastery view
        sortedList = sortOwnedCards(ownedList, sortMode, mastery);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash)
        });
      }

      // ── MASTERY DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_mastery') {
        mastery     = parseInt(interaction.values[0]); // '1', '2', or '3' → 1, 2, 3
        currentPage = 0; // Reset to first card when mastery view changes
        // Re-sort so stat values reflect the new mastery view level
        sortedList = sortOwnedCards(ownedList, sortMode, mastery);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash)
        });
      }

      // ── SEARCH BUTTON (🔍) — opens a modal for the user to type an owned card name ──
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

          // Enter search mode for this card, starting at M1
          isSearchMode  = true;
          searchEntry   = found;
          searchMastery = 1;

          await submit.update({
            embeds:     [buildCardEmbed(searchEntry, searchMastery, searchFooter(searchMastery, searchEntry.card.name), user)],
            components: buildSearchComponents(searchMastery)
          });

        } catch {
          // Modal was dismissed or timed out — do nothing, embed stays as-is
        }
      }

      // ── BACK BUTTON — exit search mode and return to the sorted collection ──
      else if (interaction.customId === 'col_back') {
        isSearchMode  = false;
        searchEntry   = null;
        searchMastery = 1;
        currentPage   = 0;
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], mastery, normalFooter(currentPage, sortedList.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, mastery, isSlash)
        });
      }
    });

    // After 2 minutes, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
