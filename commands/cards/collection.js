// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// Shows all the cards the player personally owns, one per page.
// Supports sorting, searching, and a direction-flip button.
//
// Prefix aliases: col, mycards
// Prefix controls:
//   Row 1 — 🔍 (search), ↕ (flip direction), Previous, Next
//   Row 2 — Sort dropdown (copies / health / power / speed / rank)
//
// Slash controls: sort and card are options at invocation.
//   /collection              → sorted by copies descending (default)
//   /collection sort:rank    → sorted by rank descending
//   /collection card:luffy   → jump directly to Luffy (no sort/direction button)
//
// Search mode (🔍 button or card slash option):
//   Shows the single card with only a red Back button.
//   The direction button is HIDDEN in this mode.

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

// Rank from highest to lowest — used for rank-based sorting
const RANK_ORDER = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

// Human-readable label for each sort mode, shown in the embed footer
const SORT_LABELS = {
  copies: 'By copies',
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  rank:   'By rank'
};

// The emoji used on the direction-flip button (both ascending and descending states)
const DESC_EMOJI = '<:descending:1533566429180330286>';

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
//
// isAscending controls direction:
//   false (default) → highest/most first  (e.g. 100 power → 1 power)
//   true            → lowest/least first  (e.g. 1 power → 100 power)
//
// Stat-based sorts always use M1 values (mastery view is fixed at M1)
// ─────────────────────────────────────────────
function sortOwnedCards(ownedList, sortMode, isAscending = false) {
  const copy = [...ownedList]; // Don't mutate the original array

  let sorted;

  if (sortMode === 'copies') {
    // Sort by number of copies — most copies first by default
    sorted = copy.sort((a, b) => b.copies - a.copies);
  } else if (sortMode === 'rank') {
    // Sort by rank — highest rank (UR) first by default
    sorted = copy.sort((a, b) => {
      const rankA = safeRank(a.card.rank);
      const rankB = safeRank(b.card.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  } else {
    // Sort by a stat (health / power / speed) — highest value first by default
    sorted = copy.sort((a, b) =>
      resolveCardStat(b.card, 1, sortMode) - resolveCardStat(a.card, 1, sortMode)
    );
  }

  // If the player toggled the direction button, flip the entire list
  return isAscending ? sorted.reverse() : sorted;
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
      `**Copies:** ${copies}` // Real copy count — not tied to which mastery is displayed
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
// Example: `Card 3/12 - By copies`
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'}`;
}

// ─────────────────────────────────────────────
// HELPER — search-mode footer text
// Example: `Viewing: Figarland Shanks`
// ─────────────────────────────────────────────
function searchFooter(cardName) {
  return `Viewing: ${cardName}`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
//
// The direction button (↕) is always visible in normal mode for both slash and prefix.
// It is NEVER shown in search mode (search mode shows a single card, direction is meaningless).
//
// PREFIX: 2 rows — nav buttons (including direction), sort dropdown
// SLASH:  1 row  — nav buttons only (sort is set at invocation via slash options)
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, isSlash) {
  const navRow = new ActionRowBuilder().addComponents(
    // 🔍 Search button — opens a modal to find a specific owned card
    new ButtonBuilder()
      .setCustomId('col_search')
      .setEmoji('<:magnifyingglass:1532884937294741645>')
      .setStyle(ButtonStyle.Secondary),

    // ↕ Direction button — flips the sort between highest-first and lowest-first.
    // Always grey (Secondary). Same emoji for both directions — clicking it just flips the list.
    new ButtonBuilder()
      .setCustomId('col_desc')
      .setEmoji(DESC_EMOJI)
      .setStyle(ButtonStyle.Secondary),

    // Navigate backwards through the sorted list
    new ButtonBuilder()
      .setCustomId('col_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),

    // Navigate forwards through the sorted list (blue so it stands out as the primary action)
    new ButtonBuilder()
      .setCustomId('col_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= total - 1)
  );

  // Slash users set their sort via the command option — no dropdown needed mid-session
  if (isSlash) return [navRow];

  // PREFIX: add a sort dropdown below the nav buttons
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
// Only a red Back button — no direction button (it would have nothing to do here)
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
    .setDescription('Browse the cards you own')
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
        .setDescription('Search for a specific card you own')
        .setRequired(false)
    ),

  // Prefix command definition (op collection / op col / op mycards)
  name: 'collection',
  aliases: ['col', 'mycards'],

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options (slash only) ──
    let slashSort = null;
    let slashCard = null;

    if (isSlash) {
      slashSort = interactionOrMessage.options.getString('sort');
      slashCard = interactionOrMessage.options.getString('card');

      // Using both 'card' and 'sort' at the same time doesn't make sense
      if (slashCard && slashSort) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort**. Pick one.',
          flags: 64 // Ephemeral — only the user sees this error
        });
      }
    }

    // ── STEP 2: Load the user's owned cards from the database ──
    const userData = await User.findOne({ userId: user.id });

    // Build a list of owned cards — each entry holds the card object and copy count
    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue; // Skip zero-copy entries
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue; // Skip cards that were removed from the card library
      ownedList.push({ card, copies: entry.amount });
    }

    // If the player owns nothing, tell them (no ping on prefix)
    if (ownedList.length === 0) {
      return interactionOrMessage.reply({
        content: `You don't own any cards yet. Use \`op pull\` to start pulling`,
        allowedMentions: { repliedUser: false }
      });
    }

    // ── STEP 3: Set up state ──
    // This state lives in memory for the lifetime of this message's collector.
    // Every button/dropdown interaction reads and/or updates these values.
    let sortMode     = slashSort || 'power'; // Default sort: by power
    let isAscending  = false;                // false = highest first, true = lowest first
    let currentPage  = 0;
    let isSearchMode = false;
    let searchEntry  = null; // Holds the single card shown during search mode

    // Apply the initial sort
    let sortedList = sortOwnedCards(ownedList, sortMode, isAscending);

    // ── STEP 4: Handle the 'card' slash option — enter search mode immediately ──
    if (slashCard) {
      const query = slashCard.toLowerCase().trim();
      const found = ownedList.find(e =>
        e.card.name.toLowerCase().includes(query) ||
        e.card.aliases.some(a => a && a.toLowerCase().includes(query))
      );

      if (!found) {
        return interactionOrMessage.reply({
          content: `You don't own a card matching **${slashCard}**`,
          allowedMentions: { repliedUser: false },
          flags: 64
        });
      }

      isSearchMode = true;
      searchEntry  = found;
    }

    // ── STEP 5: Build the initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      // Search mode: single card, no direction button
      embed      = buildCardEmbed(searchEntry, 1, searchFooter(searchEntry.card.name), user);
      components = buildSearchComponents();
    } else {
      // Normal browse mode
      embed      = buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user);
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash);
    }

    // ── STEP 6: Send the initial message ──
    // fetchReply: true gives us back the message object so we can attach a collector to it
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
      // Only the person who ran the command can use the buttons
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      // Reset the 2-minute inactivity timer every time the user clicks anything.
      // Without this, the buttons would disappear 2 minutes after the FIRST interaction.
      collector.resetTimer();

      // ── NEXT ──
      if (interaction.customId === 'col_next') {
        currentPage = Math.min(sortedList.length - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'col_prev') {
        currentPage = Math.max(0, currentPage - 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── DIRECTION TOGGLE BUTTON ──
      // Flips the sort between highest-first (default) and lowest-first.
      // Example with power sort:
      //   isAscending = false → 100 power, 95 power, 80 power ... (highest first)
      //   isAscending = true  →  1 power,   5 power, 12 power ... (lowest first)
      else if (interaction.customId === 'col_desc') {
        isAscending = !isAscending;     // Flip the direction
        currentPage = 0;                // Go back to page 1 so nothing feels broken
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending); // Re-sort with new direction
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0]; // The value the player selected from the dropdown
        currentPage = 0;                     // Reset to first card when the sort changes
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending); // Re-sort
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], 1, normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash)
        });
      }

      // ── SEARCH BUTTON (🔍) — opens a modal so the player can type a card name ──
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

        // Wait up to 30 seconds for the player to type and submit the modal
        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'col_search_modal' && i.user.id === user.id
          });

          const query = submit.fields.getTextInputValue('col_search_query').toLowerCase().trim();

          // Only search within cards the player actually owns
          const found = ownedList.find(e =>
            e.card.name.toLowerCase().includes(query) ||
            e.card.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            // Card not in their collection — ephemeral error, leave the embed as-is
            await submit.reply({ content: `You don't own a card matching **${query}**`, flags: 64 });
            return;
          }

          // Enter search mode — no direction button in this mode
          isSearchMode = true;
          searchEntry  = found;

          await submit.update({
            embeds:     [buildCardEmbed(searchEntry, 1, searchFooter(searchEntry.card.name), user)],
            components: buildSearchComponents()
          });

        } catch {
          // Modal was dismissed or timed out — do nothing, the embed stays as-is
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

    // After 2 minutes of inactivity, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
