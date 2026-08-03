// ─────────────────────────────────────────────
// ALLCARDS COMMAND
// ─────────────────────────────────────────────
// Shows an interactive browser of every card in the game.
// One card per page, displayed exactly like the /info command.
//
// Prefix aliases: ac, cards
// Prefix controls:
//   Row 1 — 🔍 (search by name), ↕ (flip direction), Previous, Next
//   Row 2 — Sort dropdown (health / power / speed / rank)
//   Row 3 — Mastery dropdown (M1's / M2's / M3's)
//
// Slash controls: sort, mastery, and card are options at invocation.
//   /allcards               → default (power, M1)
//   /allcards sort:rank mastery:M2  → sorted and filtered, still interactive
//   /allcards card:luffy    → search mode for Luffy (no direction button in this mode)
//
// Search mode (via 🔍 button or card option):
//   Shows M1 → M2 → M3 for a specific card with Prev/Next and a red Back button.
//   The direction button is HIDDEN in search mode.

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
// Note: User is not needed here — allcards shows every card, no personal data involved

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

// Rank from highest to lowest — used for rank-based sorting
const RANK_ORDER = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

// Human-readable label for each sort mode, used in the embed footer
const SORT_LABELS = {
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  rank:   'By rank'
};

// The emoji used on the direction-flip button (both ascending and descending states)
const DESC_EMOJI = '<:descending:1533566429180330286>';

// ─────────────────────────────────────────────
// HELPER — get the stat block for a card at a given mastery level
// Falls back to a lower mastery if the card doesn't have M2/M3 data
// ─────────────────────────────────────────────
function getCardData(card, mastery) {
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card; // M1 always uses the base card
}

// ─────────────────────────────────────────────
// HELPER — resolve a single stat for a specific card + mastery level
// ─────────────────────────────────────────────
function resolveCardStat(card, mastery, statType) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);
  return resolveStat(rank, statType, safeStat(cardData[statType]), card.name, mastery);
}

// ─────────────────────────────────────────────
// HELPER — sort a list of card objects by the given mode
//
// isAscending controls direction:
//   false (default) → highest/best first  (e.g. UR → D, 100 power → 1 power)
//   true            → lowest/worst first  (e.g. D → UR, 1 power → 100 power)
// ─────────────────────────────────────────────
function sortCards(cardList, sortMode, mastery, isAscending = false) {
  const copy = [...cardList]; // Never mutate the original array

  let sorted;

  if (sortMode === 'rank') {
    // Sort by rank — highest rank (UR) first by default
    sorted = copy.sort((a, b) => {
      const rankA = safeRank(getCardData(a, mastery).rank || a.rank);
      const rankB = safeRank(getCardData(b, mastery).rank || b.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  } else {
    // Sort by a stat (health / power / speed) — highest value first by default
    sorted = copy.sort((a, b) =>
      resolveCardStat(b, mastery, sortMode) - resolveCardStat(a, mastery, sortMode)
    );
  }

  // If the player toggled the direction button, flip the entire sorted list
  return isAscending ? sorted.reverse() : sorted;
}

// ─────────────────────────────────────────────
// HELPER — build the embed for a card at a given mastery
// Used in both normal mode and search mode
// ─────────────────────────────────────────────
function buildCardEmbed(card, mastery, footerText, user) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  // Warn in the logs if the rank is invalid so the owner knows to fix it in cards.js
  if (rank !== (cardData.rank || card.rank)) {
    console.warn(`[AllCards] "${card.name}" M${mastery} has invalid rank "${cardData.rank}". Using fallback D.`);
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
      `**Speed:** ${speed}`
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
// HELPER — normal mode footer text
// Example: `Card 3/34 - By power [M1's]`
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode, mastery) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By power'} - (M${mastery}'s)`;
}

// ─────────────────────────────────────────────
// HELPER — search mode footer text
// Example: `Card 2/3`
// ─────────────────────────────────────────────
function searchFooter(mastery) {
  return `Card ${mastery}/3`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
//
// The direction button (↕) is always visible in normal mode for BOTH slash and prefix.
// It is NEVER shown in search mode (search mode shows a single card, direction is meaningless).
//
// PREFIX: 3 rows — nav buttons (including direction), sort dropdown, mastery dropdown
// SLASH:  1 row  — nav buttons only (sort/mastery are set via slash options at invocation)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, mastery, isSlash, isAscending = false) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to search by card name
    new ButtonBuilder()
      .setCustomId('ac_search')
      .setEmoji('<:magnifyingglass:1532884937294741645>')
      .setStyle(ButtonStyle.Secondary),

    // ↕ Direction button — flips the sort between highest-first and lowest-first.
    // Always grey (Secondary). Same emoji for both directions.
    new ButtonBuilder()
      .setCustomId('ac_desc')
      .setEmoji(DESC_EMOJI)
      // Green means the reverse/descending sort is currently turned on.
      // Grey means the normal/highest-first sort is currently active.
      .setStyle(isAscending ? ButtonStyle.Success : ButtonStyle.Secondary),

    // Navigate backwards through the sorted list
    new ButtonBuilder()
      .setCustomId('ac_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),

    // Navigate forwards through the sorted list (blue = primary action)
    new ButtonBuilder()
      .setCustomId('ac_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= total - 1)
  );

  // Slash commands set sort/mastery via options — no dropdowns needed mid-session
  if (isSlash) return [navRow];

  // PREFIX: add sort and mastery dropdowns below the nav buttons
  const sortRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ac_sort')
      .setPlaceholder('Sort by...')
      .addOptions([
        { label: 'By health', value: 'health', default: sortMode === 'health' },
        { label: 'By power',  value: 'power',  default: sortMode === 'power'  },
        { label: 'By speed',  value: 'speed',  default: sortMode === 'speed'  },
        { label: 'By rank',   value: 'rank',   default: sortMode === 'rank'   }
      ])
  );

  const masteryRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ac_mastery')
      .setPlaceholder('Mastery filter...')
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
// Shows Back + Previous/Next for M1 → M2 → M3.
// No direction button — it would have nothing to do here.
// ─────────────────────────────────────────────
function buildSearchComponents(searchMastery) {
  return [
    new ActionRowBuilder().addComponents(
      // Back goes to the main sorted list — red so it stands out
      new ButtonBuilder()
        .setCustomId('ac_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('ac_prev')
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(searchMastery === 1), // Can't go before M1
      new ButtonBuilder()
        .setCustomId('ac_next')
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
  // Slash command definition (/allcards)
  data: new SlashCommandBuilder()
    .setName('allcards')
    .setDescription('See a list of all the cards in the game')
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('Sort by a specific filter')
        .setRequired(false)
        .addChoices(
          { name: 'By health', value: 'health' },
          { name: 'By power',  value: 'power'  },
          { name: 'By speed',  value: 'speed'  },
          { name: 'By rank',   value: 'rank'   }
        )
    )
    .addStringOption(option =>
      option
        .setName('mastery')
        .setDescription('Filter by mastery level')
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
        .setDescription('Search for a specific card directly')
        .setRequired(false)
    ),

  // Prefix command definition (op allcards / op ac / op cards)
  name: 'allcards',
  aliases: ['ac', 'cards'],

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options (slash only) ──
    let slashSort    = null;
    let slashMastery = null;
    let slashCard    = null;

    if (isSlash) {
      slashSort    = interactionOrMessage.options.getString('sort');
      slashMastery = interactionOrMessage.options.getString('mastery');
      slashCard    = interactionOrMessage.options.getString('card');

      // 'card' conflicts with sort/mastery — they serve different purposes
      if (slashCard && (slashSort || slashMastery)) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort** or **mastery**. Pick one.',
          flags: 64 // Ephemeral — only visible to the user
        });
      }
    }

    // ── STEP 2: Set up state ──
    // This state lives in memory for the lifetime of this message's collector.
    // Every button/dropdown interaction reads and/or updates these values.
    let sortMode      = slashSort    || 'power';       // Default sort: by power
    let mastery       = parseInt(slashMastery) || 1;   // Default mastery: M1
    let isAscending   = false;                         // false = highest first, true = lowest first
    let currentPage   = 0;
    let isSearchMode  = false;
    let searchCard    = null; // The card object being shown in search mode
    let searchMastery = 1;   // Which mastery (1/2/3) is showing in search mode

    // ── STEP 3: Handle the 'card' slash option — enter search mode immediately ──
    if (slashCard) {
      const query = slashCard.toLowerCase().trim();
      const found = cards.find(c =>
        c.name.toLowerCase().includes(query) ||
        c.aliases.some(a => a && a.toLowerCase().includes(query))
      );

      if (!found) {
        return interactionOrMessage.reply({
          content: `**${slashCard}** is not a valid card`,
          allowedMentions: { repliedUser: false },
          flags: 64
        });
      }

      isSearchMode  = true;
      searchCard    = found;
      searchMastery = 1;
    }

    // ── STEP 4: Build the initial sorted card list ──
    // Filter out any blank/unnamed entries that might exist in the card data
    let sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, isAscending);

    // ── STEP 5: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      // Search mode: single card, no direction button
      embed      = buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery), user);
      components = buildSearchComponents(searchMastery);
    } else {
      // Normal browse mode: full nav with direction button
      embed      = buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user);
      components = buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending);
    }

    // ── STEP 6: Send the message ──
    // fetchReply: true gives us back the sent message object so we can attach a collector to it
    const payload = { embeds: [embed], components, fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 7: Set up the interaction collector ──
    // A "collector" listens for button clicks and dropdown changes on this specific message.
    // The timer starts when the message is sent and resets each time the user interacts.
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can interact with it
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      // Reset the 2-minute inactivity timer every time the user clicks anything.
      // Without this, the buttons would disappear 2 minutes after the FIRST interaction.
      collector.resetTimer();

      // ── NEXT ──
      if (interaction.customId === 'ac_next') {
        if (isSearchMode) {
          // In search mode: move to the next mastery (M1 → M2 → M3)
          searchMastery = Math.min(3, searchMastery + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.min(sortedCards.length - 1, currentPage + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
          });
        }
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'ac_prev') {
        if (isSearchMode) {
          searchMastery = Math.max(1, searchMastery - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.max(0, currentPage - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
          });
        }
      }

      // ── DIRECTION TOGGLE BUTTON ──
      // Flips the sort between highest-first (default) and lowest-first.
      // Example with power sort:
      //   isAscending = false → 100 power, 95 power, 80 power ... (highest first)
      //   isAscending = true  →  1 power,   5 power, 12 power ... (lowest first)
      else if (interaction.customId === 'ac_desc') {
        isAscending = !isAscending;    // Flip the direction
        currentPage = 0;               // Go back to page 1 so nothing feels broken
        sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, isAscending);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'ac_sort') {
        sortMode    = interaction.values[0]; // The value the player selected
        currentPage = 0;                     // Reset to first card when sort changes
        sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, isAscending);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
        });
      }

      // ── MASTERY DROPDOWN (prefix only) ──
      else if (interaction.customId === 'ac_mastery') {
        mastery     = parseInt(interaction.values[0]); // '1', '2', or '3' → 1, 2, 3
        currentPage = 0; // Reset to first card when mastery changes

        // Re-sort because stat values change between masteries (e.g. M2 has different power than M1)
        sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, isAscending);

        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
        });
      }

      // ── SEARCH BUTTON (🔍) — opens a modal for the user to type a card name ──
      else if (interaction.customId === 'ac_search') {
        const modal = new ModalBuilder()
          .setCustomId('ac_search_modal')
          .setTitle('Search for a card')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('ac_search_query')
                .setLabel('Card name or alias')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);

        // Wait up to 30 seconds for the player to type and submit the modal
        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'ac_search_modal' && i.user.id === user.id
          });

          const query = submit.fields.getTextInputValue('ac_search_query').toLowerCase().trim();

          // Search across all cards in the game
          const found = cards.find(c =>
            c.name.toLowerCase().includes(query) ||
            c.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            // Card not found — tell the user and leave the embed unchanged
            await submit.reply({ content: `**${query}** is not a valid card`, flags: 64 });
            return;
          }

          // Enter search mode for this card, starting at M1
          isSearchMode  = true;
          searchCard    = found;
          searchMastery = 1;

          await submit.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery), user)],
            components: buildSearchComponents(searchMastery)
          });

        } catch {
          // Modal was dismissed or timed out — do nothing, the embed stays as-is
        }
      }

      // ── BACK BUTTON — exit search mode and return to the sorted list ──
      else if (interaction.customId === 'ac_back') {
        isSearchMode  = false;
        searchCard    = null;
        searchMastery = 1;
        currentPage   = 0;

        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash, isAscending)
        });
      }
    });

    // After 2 minutes of inactivity, remove all buttons so old messages stay clean
    collector.on('end', async () => {
      // Keep the card visible, but clearly mark the controls as expired.
      // Building a new footer with only text removes the user's avatar icon.
      try {
        // Fetch the latest version so navigation changes are not overwritten.
        const latestResponse = await response.fetch();
        const expiredEmbed = EmbedBuilder
          .from(latestResponse.embeds[0])
          .setFooter({ text: `expired` });

        await latestResponse.edit({ embeds: [expiredEmbed], components: [] });
      } catch {
        // The message may have been deleted while the collector was ending.
      }
    });
  }
};
