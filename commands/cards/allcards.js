// ─────────────────────────────────────────────
// ALLCARDS COMMAND
// ─────────────────────────────────────────────
// Shows an interactive browser of every card in the game.
// One card per page, displayed exactly like the /info command.
//
// Prefix aliases: ac, cards
// Prefix controls:
//   Row 1 — 🔍 (search by name), Previous, Next
//   Row 2 — Sort dropdown (health / power / speed / copies / rank)
//   Row 3 — Mastery dropdown (M1's / M2's / M3's)
//
// Slash controls: sort, mastery, and card are options at invocation.
//   /allcards               → default (power, M1)
//   /allcards sort:rank mastery:M2  → sorted and filtered, still interactive
//   /allcards card:luffy    → search mode for Luffy (can't combine with sort/mastery)
//
// Search mode (via 🔍 button or card option):
//   Shows a specific card's M1 → M2 → M3 with Prev/Next and a red Back button.

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
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  copies: 'By copies',
  rank:   'By rank'
};

// ─────────────────────────────────────────────
// HELPER — resolve a stat for a specific card + mastery level
// Handles missing M2/M3 by falling back to the base card data
// ─────────────────────────────────────────────
function getCardData(card, mastery) {
  // Try to get the right mastery block; fall back to the base card if it's missing
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card; // M1 always uses the base card
}

function resolveCardStat(card, mastery, statType) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);
  return resolveStat(rank, statType, safeStat(cardData[statType]), card.name, mastery);
}

// ─────────────────────────────────────────────
// HELPER — sort a list of card objects
// 'userCopies' is the player's cardCopies array (needed only for 'copies' sort)
// ─────────────────────────────────────────────
function sortCards(cardList, sortMode, mastery, userCopies) {
  const copy = [...cardList]; // Don't mutate the original

  if (sortMode === 'rank') {
    return copy.sort((a, b) => {
      const rankA = safeRank(getCardData(a, mastery).rank || a.rank);
      const rankB = safeRank(getCardData(b, mastery).rank || b.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  }

  if (sortMode === 'copies') {
    return copy.sort((a, b) => {
      const copA = userCopies?.find(c => c.cardName === a.name)?.amount || 0;
      const copB = userCopies?.find(c => c.cardName === b.name)?.amount || 0;
      return copB - copA; // Most copies first
    });
  }

  // health, power, or speed — highest value first
  return copy.sort((a, b) => {
    return resolveCardStat(b, mastery, sortMode) - resolveCardStat(a, mastery, sortMode);
  });
}

// ─────────────────────────────────────────────
// HELPER — build the embed for a card at a given mastery
// Used in both normal mode and search mode
// ─────────────────────────────────────────────
function buildCardEmbed(card, mastery, footerText, user) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  // Warn in logs if the rank is invalid so the owner knows about a data problem
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
// Example: "Card 3/34 - By power [M1's]"
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode, mastery) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By power'} [M${mastery}'s]`;
}

// ─────────────────────────────────────────────
// HELPER — search mode footer text
// Example: "Card 2/3 - [Monkey D. Luffy]"
// ─────────────────────────────────────────────
function searchFooter(mastery, cardName) {
  return `Card ${mastery}/3 - [${cardName}]`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
// PREFIX: 3 rows — nav buttons, sort dropdown, mastery dropdown
// SLASH:  1 row  — nav buttons only (sort/mastery are slash options)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, mastery, isSlash) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to search by card name
    new ButtonBuilder()
      .setCustomId('ac_search')
      .setLabel('🔍')
      .setStyle(ButtonStyle.Secondary),
    // Previous card
    new ButtonBuilder()
      .setCustomId('ac_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    // Next card (blue = primary to stand out)
    new ButtonBuilder()
      .setCustomId('ac_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= total - 1)
  );

  // Slash commands set sort/mastery via options — no dropdowns needed
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
        { label: 'By copies', value: 'copies', default: sortMode === 'copies' },
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
// Back button (red) + Previous/Next for M1 → M2 → M3
// ─────────────────────────────────────────────
function buildSearchComponents(searchMastery) {
  return [
    new ActionRowBuilder().addComponents(
      // Back goes back to the main sorted list — red so it stands out
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
    .setDescription('Browse all cards in the game.')
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('How to sort the card list (default: by power)')
        .setRequired(false)
        .addChoices(
          { name: 'By health', value: 'health' },
          { name: 'By power',  value: 'power'  },
          { name: 'By speed',  value: 'speed'  },
          { name: 'By copies', value: 'copies' },
          { name: 'By rank',   value: 'rank'   }
        )
    )
    .addStringOption(option =>
      option
        .setName('mastery')
        .setDescription('Which mastery level to display (default: M1)')
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
        .setDescription('Search for a specific card (cannot be used with sort or mastery)')
        .setRequired(false)
    ),

  // Prefix command definition
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

      // 'card' can't be combined with sort or mastery — they conflict
      if (slashCard && (slashSort || slashMastery)) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort** or **mastery**. Pick one.',
          flags: 64 // Ephemeral — only visible to the user
        });
      }
    }

    // ── STEP 2: Fetch user data for "by copies" sort ──
    const userData   = await User.findOne({ userId: user.id });
    let userCopies = userData?.cardCopies || [];

    // ── STEP 3: Set up initial state ──
    let sortMode    = slashSort    || 'power';       // Default sort: by power
    let mastery     = parseInt(slashMastery) || 1;   // Default mastery: M1
    let currentPage = 0;
    let isSearchMode  = false;
    let searchCard    = null; // The card object being shown in search mode
    let searchMastery = 1;   // Which mastery (1/2/3) is showing in search mode

    // ── STEP 4: Handle 'card' option / enter search mode immediately ──
    if (slashCard) {
      const query = slashCard.toLowerCase().trim();
      const found = cards.find(c =>
        c.name.toLowerCase().includes(query) ||
        c.aliases.some(a => a && a.toLowerCase().includes(query))
      );

      if (!found) {
        return interactionOrMessage.reply({
          content: `**${slashCard}** is not a valid card.`,
          flags: 64
        });
      }

      isSearchMode  = true;
      searchCard    = found;
      searchMastery = 1;
    }

    // ── STEP 5: Build the initial sorted card list ──
    let sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, userCopies);

    // ── STEP 6: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      embed      = buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery, searchCard.name), user);
      components = buildSearchComponents(searchMastery);
    } else {
      embed      = buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user);
      components = buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash);
    }

    // ── STEP 7: Send the message ──
    // fetchReply: true gives us back the sent message so we can attach a collector
    const payload = { embeds: [embed], components, fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 8: Set up the interaction collector ──
    // Watches for button clicks and dropdown selections on this message for 2 minutes
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can interact with it
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // ── NEXT (normal mode: advance to next card) ──
      if (interaction.customId === 'ac_next') {
        if (isSearchMode) {
          // In search mode: move to the next mastery level (M1 → M2 → M3)
          searchMastery = Math.min(3, searchMastery + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery, searchCard.name), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.min(sortedCards.length - 1, currentPage + 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash)
          });
        }
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'ac_prev') {
        if (isSearchMode) {
          searchMastery = Math.max(1, searchMastery - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery, searchCard.name), user)],
            components: buildSearchComponents(searchMastery)
          });
        } else {
          currentPage = Math.max(0, currentPage - 1);
          await interaction.update({
            embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
            components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash)
          });
        }
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'ac_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0; // Reset to first card when sort changes

        // Refresh copies data whenever the user switches to "by copies" sort
        // so they see their current collection, not stale data from command start
        if (sortMode === 'copies') {
          const freshData = await User.findOne({ userId: user.id });
          userCopies = freshData?.cardCopies || [];
        }

        sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, userCopies);

        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash)
        });
      }

      // ── MASTERY DROPDOWN (prefix only) ──
      else if (interaction.customId === 'ac_mastery') {
        mastery     = parseInt(interaction.values[0]); // '1', '2', or '3' → 1, 2, 3
        currentPage = 0; // Reset to first card when mastery changes

        // Re-sort with the new mastery so stat values reflect the displayed level
        sortedCards = sortCards(cards.filter(c => c.name), sortMode, mastery, userCopies);

        await interaction.update({
          embeds:     [buildCardEmbed(sortedCards[currentPage], mastery, normalFooter(currentPage, sortedCards.length, sortMode, mastery), user)],
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash)
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

        // Wait up to 30 seconds for the user to submit the modal
        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'ac_search_modal' && i.user.id === user.id
          });

          const query = submit.fields.getTextInputValue('ac_search_query').toLowerCase().trim();

          // Find the card by name or alias
          const found = cards.find(c =>
            c.name.toLowerCase().includes(query) ||
            c.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            // Card not found — tell the user and stay on the current embed
            await submit.reply({ content: `**${query}** is not a valid card.`, flags: 64 });
            return;
          }

          // Enter search mode for this card, starting at M1
          isSearchMode  = true;
          searchCard    = found;
          searchMastery = 1;

          await submit.update({
            embeds:     [buildCardEmbed(searchCard, searchMastery, searchFooter(searchMastery, searchCard.name), user)],
            components: buildSearchComponents(searchMastery)
          });

        } catch {
          // Modal was dismissed or timed out — do nothing, embed stays as-is
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
          components: buildNormalComponents(sortedCards.length, currentPage, sortMode, mastery, isSlash)
        });
      }
    });

    // After 2 minutes, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
