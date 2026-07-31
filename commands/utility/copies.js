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
// (Prev/Next buttons + sort dropdown + search button)
// The search button is included for both slash and prefix commands.
// When the user clicks it, the button click is always an interaction, so
// modals work fine even if the original command was a prefix command.
// ─────────────────────────────────────────────
function buildComponents(list, page, mode) {
  const totalPages = Math.max(1, Math.ceil(list.length / CARDS_PER_PAGE));

  // Navigation buttons + search button
  const navRow = new ActionRowBuilder().addComponents(
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
    new ButtonBuilder()
      .setCustomId('copies_search')
      .setLabel('<:magnifyingglass:1532884937294741645>')
      .setStyle(ButtonStyle.Secondary)
  );

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
  // Optional filters:
  //   sort — sort the full collection by amount, rank, or date (no buttons, static result)
  //   card — filter to a specific card name (no buttons, static result)
  // You cannot use sort and card at the same time — pick one.
  data: new SlashCommandBuilder()
    .setName('copies')
    .setDescription('View all your card copies.')
    .addStringOption(option =>
      option
        .setName('sort')
        .setDescription('Sort your collection (returns a static result, no buttons)')
        .setRequired(false)
        .addChoices(
          { name: 'By amount', value: 'amount' },
          { name: 'By rank',   value: 'rank'   },
          { name: 'By date',   value: 'date'   }
        )
    )
    .addStringOption(option =>
      option
        .setName('card')
        .setDescription('Show copies of a specific card (returns a static result, no buttons)')
        .setRequired(false)
    ),

  // Prefix command definition (op copies / op c / etc.)
  name: 'copies',
  aliases: ['c', 'cinv', 'dupes', 'duplicates'],

  async execute(interactionOrMessage, args) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    // isSlash is true for /copies, false for "op copies"
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // ── STEP 1: Read slash options to set the initial state ──
    // Slash users can pre-set sort mode or filter to a specific card via options.
    // Either way, the result is still interactive with Prev/Next buttons.
    let initialSort       = 'amount'; // Default sort: by amount
    let initialCardFilter = null;     // null = no card filter

    if (isSlash) {
      const sortOption = interactionOrMessage.options.getString('sort');
      const cardOption = interactionOrMessage.options.getString('card');

      // You can't use both filters at the same time — let the user know
      if (sortOption && cardOption) {
        return interactionOrMessage.reply({
          content: 'You can only use **sort** or **card**, not both at the same time.',
          flags: 64 // Ephemeral — only the user sees this error
        });
      }

      if (sortOption) initialSort       = sortOption;
      if (cardOption) initialCardFilter = cardOption;
    }

    // ── STEP 2: Load the player's card collection from the database ──
    const userData  = await User.findOne({ userId: user.id });
    const rawCopies = [...(userData?.cardCopies || [])]; // Spread so we don't mutate the DB object

    // ── STEP 3: Set up state variables for this session ──
    // These are tracked in a "closure" — meaning the button collector below
    // can read and change them even after the initial reply has been sent.
    let sortMode     = initialSort;
    let currentPage  = 0;
    let isSearchMode = false;
    let searchResults = [];

    // If a card filter was provided via slash option, start in search mode
    // so the user immediately sees the filtered results with a Back button.
    if (initialCardFilter) {
      const query = initialCardFilter.toLowerCase().trim();
      searchResults = rawCopies.filter(item => {
        const cardData = cards.find(c => c.name === item.cardName);
        if (!cardData) return item.cardName.toLowerCase().includes(query);
        return (
          cardData.name.toLowerCase().includes(query) ||
          cardData.aliases.some(a => a && a.toLowerCase().includes(query))
        );
      });
      isSearchMode = true;
    }

    // Start with the initial sort applied to the full list (used for normal mode)
    let currentList = sortList(rawCopies, sortMode);

    // ── STEP 4: Send the initial embed ──
    // fetchReply: true gives us back the sent message object so we can attach a collector
    // If we started in search mode (via slash 'card' option), show search results immediately.
    // Otherwise show the normal sorted list.
    const initialList = isSearchMode ? searchResults : currentList;
    const initialMode = isSearchMode ? 'search'      : sortMode;
    const payload = {
      embeds:     [buildEmbed(user, initialList, currentPage, initialMode)],
      components: isSearchMode ? buildSearchComponents() : buildComponents(initialList, currentPage, sortMode),
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 5: Set up the button/dropdown collector ──
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
          components: isSearchMode ? buildSearchComponents() : buildComponents(list, currentPage, sortMode)
        });
      }

      // ── NEXT PAGE ──
      else if (interaction.customId === 'copies_next') {
        const list       = isSearchMode ? searchResults : sortList(freshCopies, sortMode);
        const totalPages = Math.max(1, Math.ceil(list.length / CARDS_PER_PAGE));
        currentPage = Math.min(totalPages - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildEmbed(user, list, currentPage, isSearchMode ? 'search' : sortMode)],
          components: isSearchMode ? buildSearchComponents() : buildComponents(list, currentPage, sortMode)
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
          components: buildComponents(currentList, currentPage, sortMode)
        });
      }

      // ── SEARCH BUTTON ──
      // Shows a modal — a small popup form where the user types their search term.
      // This works for both slash and prefix commands because the button click itself
      // is always an interaction, regardless of how the command was originally run.
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
          components: buildComponents(currentList, currentPage, sortMode)
        });
      }
    });

    // After 2 minutes, remove all buttons so old messages stay clean
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};
