// Discord.js components needed for this command:
// - SlashCommandBuilder: defines the /copies slash command
// - ActionRowBuilder: a container that holds buttons or dropdowns
// - ButtonBuilder: creates clickable buttons
// - ButtonStyle: the visual style of a button (e.g. grey = Secondary)
// - StringSelectMenuBuilder: creates a dropdown menu
// - ModalBuilder: creates a popup form (text input window)
// - TextInputBuilder / TextInputStyle: the text field inside the modal
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

// Card data so we can look up each card's rank and name.
// rankEmojis is the single shared emoji config — edit it in data/cards.js to update everywhere.
const { cards, safeRank, rankEmojis: RANK_EMOJIS } = require('../../data/cards');

// User model so we can read the player's saved card collection from MongoDB
const User = require('../../models/user');

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

// Rank order for "By rank" sorting — highest (UR) to lowest (D)
const RANK_ORDER = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

// How many cards to show per page
const CARDS_PER_PAGE = 10;

// ─────────────────────────────────────────────
// HELPER — sort a copy list by a given mode
// ─────────────────────────────────────────────
// 'amount': most copies first  (default)
// 'rank':   UR → D
// 'date':   most recently obtained first
function sortList(list, mode) {
  const copy = [...list]; // Spread into a new array so we don't mutate the original

  if (mode === 'amount') {
    return copy.sort((a, b) => b.amount - a.amount);
  }

  if (mode === 'rank') {
    return copy.sort((a, b) => {
      // Look up each card in the card library to find its rank
      const cardA = cards.find(c => c.name === a.cardName);
      const cardB = cards.find(c => c.name === b.cardName);
      // RANK_ORDER.indexOf returns 0 for UR (highest), 6 for D (lowest)
      const rA = RANK_ORDER.indexOf(safeRank(cardA?.rank || 'D'));
      const rB = RANK_ORDER.indexOf(safeRank(cardB?.rank || 'D'));
      return rA - rB; // Lower index = higher rank = appears first
    });
  }

  if (mode === 'date') {
    // Most recently obtained first — sort by lastObtained descending
    return copy.sort((a, b) => new Date(b.lastObtained) - new Date(a.lastObtained));
  }

  return copy; // Unknown mode — return unsorted
}

// ─────────────────────────────────────────────
// HELPER — build the embed for a given page
// ─────────────────────────────────────────────
function buildEmbed(user, list, page, mode) {
  const totalPages = Math.max(1, Math.ceil(list.length / CARDS_PER_PAGE));

  // Slice the list to only the cards that belong on this page
  const pageItems = list.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE);

  // Footer suffix that tells the user what sorting is active
  const sortLabels = {
    amount: '- By amount',
    rank:   '- By rank',
    date:   '- By date',
    search: '- By search'
  };

  // Build each line: "<emoji> **Card Name** : 5"
  const lines = pageItems.map(item => {
    const cardData = cards.find(c => c.name === item.cardName);
    const rank  = cardData ? safeRank(cardData.rank) : 'D';
    const emoji = RANK_EMOJIS[rank] || ''; // Empty string if no emoji is configured
    return `${emoji} **${item.cardName}** : ${item.amount}`;
  });

  return {
    title: `${user.username}'s storage`,
    description: lines.length > 0 ? lines.join('\n') : 'No cards found.',
    thumbnail: { url: user.displayAvatarURL({ dynamic: true }) },
    color: 0xFFFFFF,
    footer: { text: `Page ${page + 1}/${totalPages} ${sortLabels[mode] || ''}` }
  };
}

// ─────────────────────────────────────────────
// HELPER — build the normal browsing components
// (Prev/Next buttons + sort dropdown + optional search button)
// ─────────────────────────────────────────────
function buildComponents(list, page, mode, isSlash) {
  const totalPages = Math.max(1, Math.ceil(list.length / CARDS_PER_PAGE));

  // Navigation buttons
  const navButtons = [
    new ButtonBuilder()
      .setCustomId('copies_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),             // Can't go before page 1
    new ButtonBuilder()
      .setCustomId('copies_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1), // Can't go past the last page
  ];

  // The search button only works with slash commands (modals require an interaction context)
  if (isSlash) {
    navButtons.push(
      new ButtonBuilder()
        .setCustomId('copies_search')
        .setLabel('🔍')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  const navRow  = new ActionRowBuilder().addComponents(...navButtons);

  // Sort dropdown — shows which option is currently active with default: true
  const sortRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('copies_sort')
      .setPlaceholder('Sort by...')
      .addOptions([
        { label: 'By amount', value: 'amount', default: mode === 'amount' },
        { label: 'By rank',   value: 'rank',   default: mode === 'rank'   },
        { label: 'By date',   value: 'date',   default: mode === 'date'   },
      ])
  );

  return [navRow, sortRow];
}

// ─────────────────────────────────────────────
// HELPER — build the search-mode components
// (just a Back button — all other controls are hidden during search)
// ─────────────────────────────────────────────
function buildSearchComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('copies_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
  // Slash command definition (/copies)
  data: new SlashCommandBuilder()
    .setName('copies')
    .setDescription('View all your card copies.'),

  // Prefix command definition (op copies / op col)
  name: 'copies',
  aliases: ['c'],
  async execute(interactionOrMessage, args) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    // isSlash is true for /copies, false for "op copies"
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Load the player's card collection from the database ──
    const userData = await User.findOne({ userId: user.id });
    const rawCopies = [...(userData?.cardCopies || [])]; // Spread into a plain JS array

    // ── STEP 2: Set up state variables for this session ──
    // These are tracked in a "closure" — meaning the button collector below
    // can read and change them even after the initial reply has been sent.
    let sortMode     = 'amount'; // Which sort is currently active
    let currentPage  = 0;        // Which page is currently showing (0-based)
    let isSearchMode = false;    // Whether we're showing search results right now
    let searchResults = [];      // The filtered list used in search mode

    // Start with the default sort
    let currentList = sortList(rawCopies, sortMode);

    // ── STEP 3: Send the initial embed ──
    // fetchReply: true gives us back the sent message object so we can attach a collector
    const payload = {
      embeds:     [buildEmbed(user, currentList, currentPage, sortMode)],
      components: buildComponents(currentList, currentPage, sortMode, isSlash),
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 4: Set up the button/dropdown collector ──
    // The collector watches for any button click or dropdown selection on this message.
    // It stops listening after 2 minutes (120000ms) of inactivity.
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      // Reject clicks from anyone other than the command user
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: "This isn't yours.", flags: 64 });
      }

      // Re-fetch the user's latest data every time a button is clicked.
      // This ensures that if they pulled a card while browsing, it shows up.
      const freshData  = await User.findOne({ userId: user.id });
      const freshCopies = [...(freshData?.cardCopies || [])];

      // ── PREVIOUS PAGE ──
      if (interaction.customId === 'copies_prev') {
        currentPage = Math.max(0, currentPage - 1);
        const list = isSearchMode ? searchResults : sortList(freshCopies, sortMode);
        await interaction.update({
          embeds:     [buildEmbed(user, list, currentPage, isSearchMode ? 'search' : sortMode)],
          components: isSearchMode ? buildSearchComponents() : buildComponents(list, currentPage, sortMode, isSlash)
        });
      }

      // ── NEXT PAGE ──
      else if (interaction.customId === 'copies_next') {
        const list       = isSearchMode ? searchResults : sortList(freshCopies, sortMode);
        const totalPages = Math.max(1, Math.ceil(list.length / CARDS_PER_PAGE));
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildEmbed(user, list, currentPage, isSearchMode ? 'search' : sortMode)],
          components: isSearchMode ? buildSearchComponents() : buildComponents(list, currentPage, sortMode, isSlash)
        });
      }

      // ── SORT DROPDOWN ──
      else if (interaction.customId === 'copies_sort') {
        sortMode     = interaction.values[0]; // The value the user selected ('amount', 'rank', or 'date')
        currentPage  = 0;                      // Reset to page 1 whenever sort changes
        isSearchMode = false;                  // Exit search mode if active
        currentList  = sortList(freshCopies, sortMode);
        await interaction.update({
          embeds:     [buildEmbed(user, currentList, currentPage, sortMode)],
          components: buildComponents(currentList, currentPage, sortMode, isSlash)
        });
      }

      // ── SEARCH BUTTON (slash only) ──
      // Shows a modal — a small popup form where the user types their search term.
      else if (interaction.customId === 'copies_search') {
        const modal = new ModalBuilder()
          .setCustomId('copies_search_modal')
          .setTitle('Search your storage')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('copies_search_query')
                .setLabel('Card name or alias')
                .setStyle(TextInputStyle.Short) // Single-line text box
                .setRequired(true)
            )
          );

        // showModal() sends the popup to the user. After this, the button interaction is done.
        await interaction.showModal(modal);

        // Wait up to 30 seconds for the user to submit the modal.
        // If they close it without submitting, the catch block below handles it silently.
        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'copies_search_modal' && i.user.id === user.id
          });

          // Get the text the user typed and clean it up
          const query = submit.fields.getTextInputValue('copies_search_query').toLowerCase().trim();

          // Re-fetch the latest copies at search time
          const latestData   = await User.findOne({ userId: user.id });
          const latestCopies = [...(latestData?.cardCopies || [])];

          // Filter copies: match by card name or alias (same logic as the info command)
          searchResults = latestCopies.filter(item => {
            const cardData = cards.find(c => c.name === item.cardName);
            if (!cardData) return item.cardName.toLowerCase().includes(query);
            return (
              cardData.name.toLowerCase().includes(query) ||
              cardData.aliases.some(a => a && a.toLowerCase().includes(query))
            );
          });

          isSearchMode = true;
          currentPage  = 0;

          // submit.update() edits the original embed message with the search results
          await submit.update({
            embeds:     [buildEmbed(user, searchResults, 0, 'search')],
            components: buildSearchComponents() // Only the Back button shows during search
          });

        } catch {
          // Modal was dismissed or timed out — nothing to do, the embed stays as-is
        }
      }

      // ── BACK BUTTON (exits search mode and returns to normal browsing) ──
      else if (interaction.customId === 'copies_back') {
        isSearchMode  = false;
        searchResults = [];
        currentPage   = 0;
        currentList   = sortList(freshCopies, sortMode); // Re-sort with latest data

        await interaction.update({
          embeds:     [buildEmbed(user, currentList, currentPage, sortMode)],
          components: buildComponents(currentList, currentPage, sortMode, isSlash)
        });
      }
    });

    // After 2 minutes, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
