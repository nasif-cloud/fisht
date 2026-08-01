// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// The personal version of /allcards — shows only the cards the user owns.
// All cards are M1 (there is currently no upgrade system to M2/M3).
// A Copies field is shown on every card embed.
//
// Prefix aliases: col, mycards
// Prefix controls:
//   Row 1 — 🔍 (search), Previous, Next
//   Row 2 — Sort dropdown (copies / health / power / speed / rank)
//
// Slash controls: sort and card are options at invocation.
//   /collection              → sorted by copies (default)
//   /collection sort:rank    → sorted by rank
//   /collection card:luffy   → jump to Luffy in your collection (cannot combine with sort)
//
// Search mode (🔍 button or card slash option):
//   Shows the single M1 version of the owned card with only a red Back button.
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

// Human-readable label for each sort mode, shown in the embed footer
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
// Each entry is: { card, copies }
// Stat-based sorts always use M1 (mastery view is fixed at M1 for normal mode)
// ─────────────────────────────────────────────
function sortOwnedCards(ownedList, sortMode) {
  const copy = [...ownedList]; // Don't mutate the original

  if (sortMode === 'copies') {
    // Most copies first — the natural default for a personal collection
    return copy.sort((a, b) => b.copies - a.copies);
  }

  if (sortMode === 'rank') {
    return copy.sort((a, b) => {
      // Always compare rank at M1 (the base card rank)
      const rankA = safeRank(a.card.rank);
      const rankB = safeRank(b.card.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  }

  // health, power, speed — sort by M1 stat values
  return copy.sort((a, b) => {
    return resolveCardStat(b.card, 1, sortMode) - resolveCardStat(a.card, 1, sortMode);
  });
}

// ─────────────────────────────────────────────
// HELPER — build the embed for one owned card at a given mastery
// Always shows the real Copies count regardless of which mastery is displayed
// ─────────────────────────────────────────────
function buildCardEmbed(entry, mastery, footerText, user) {
  const { card, copies } = entry;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  // Warn in logs if the rank value is invalid so the owner can find and fix it
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
      `**Copies:** ${copies}` // Real copy count, not tied to mastery display
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
// Example: "Card 3/12 - By copies"
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'}`;
}


// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
// PREFIX: 2 rows — nav buttons, sort dropdown
// SLASH:  1 row  — nav buttons only (sort is set at invocation)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, isSlash) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to find a specific owned card
    new ButtonBuilder()
      .setCustomId('col_search')
      .setEmoji('<:magnifyingglass:1532884937294741645>')
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

  // Slash users set sort via command option — no dropdown needed mid-session
  if (isSlash) return [navRow];

  // PREFIX: add sort dropdown below nav buttons
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
// HELPER — components for search (single-card) mode
// All owned cards are M1 only, so there is nothing to cycle through.
// Only a red Back button is shown.
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
    .setDescription("Browse the cards you own.")
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('Sort by a specific filter')
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
        .setDescription('Search for a specific card')
        .setRequired(false)
    ),

  // Prefix command definition
  name: 'collection',
  aliases: ['col', 'mycards'],

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options ──
    let slashSort = null;
    let slashCard = null;

    if (isSlash) {
      slashSort = interactionOrMessage.options.getString('sort');
      slashCard = interactionOrMessage.options.getString('card');

      // 'card' can't be combined with 'sort' — they serve different purposes
      if (slashCard && slashSort) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort**. Pick one.',
          flags: 64 // Ephemeral — only the user sees this error
        });
      }
    }

    // ── STEP 2: Load the user's owned cards from the database ──
    const userData = await User.findOne({ userId: user.id });

    // Build a list of owned cards: each entry holds the card object and copy count.
    // Each entry holds the card object and how many copies the user owns.
    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue; // Skip zero-copy entries (safety)
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue; // Skip cards removed from the card library
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

    // ── STEP 3: Set up state ──
    let sortMode     = slashSort || 'power'; // Default sort: by power
    let currentPage  = 0;
    let isSearchMode = false;
    let searchEntry  = null; // The single owned-card entry shown in search mode

    // Apply the initial sort to the owned list (always M1 for stat-based sorts)
    let sortedList = sortOwnedCards(ownedList, sortMode);

    // ── STEP 4: Handle 'card' slash option — enter search mode immediately ──
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

      isSearchMode = true;
      searchEntry  = found;
    }

    // ── STEP 5: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      // Search mode: always M1 (all owned cards are currently M1 only)
      embed      = buildCardEmbed(searchEntry, 1, searchFooter(searchEntry.card.name), user);
      components = buildSearchComponents();
    } else {
      // Normal browse: always display at M1
      embed      = buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user);
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash);
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

      // ── NEXT (normal browse only — search mode has no nav) ──
      if (interaction.customId === 'col_next') {
        currentPage = Math.min(sortedList.length - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── PREVIOUS (normal browse only — search mode has no nav) ──
      else if (interaction.customId === 'col_prev') {
        currentPage = Math.max(0, currentPage - 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0; // Reset to first card when sort changes
        sortedList  = sortOwnedCards(ownedList, sortMode); // Re-sort
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SEARCH BUTTON (🔍) — opens a modal for the user to type a card name ──
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
            // Not in their collection — ephemeral error, embed stays unchanged
            await submit.reply({ content: `You don't own a card matching **${query}**.`, flags: 64 });
            return;
          }

          // Enter search mode — all owned cards are M1 only
          isSearchMode = true;
          searchEntry  = found;

          await submit.update({
            embeds:     [buildCardEmbed(searchEntry, 1, searchFooter(searchEntry.card.name), user)],
            components: buildSearchComponents()
          });

        } catch {
          // Modal was dismissed or timed out — do nothing, embed stays as-is
        }
      }

      // ── BACK BUTTON — exit search mode and return to the sorted list ──
      else if (interaction.customId === 'col_back') {
        isSearchMode = false;
        searchEntry  = null;
        currentPage  = 0;
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
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
