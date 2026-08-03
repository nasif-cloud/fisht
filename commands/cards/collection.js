// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// Shows all the cards the player personally owns, one per page.
// Supports sorting, searching, and a direction-flip button.
//
// Each card is shown at the mastery the player actually owns (M1/M2/M3),
// and all stats include copies + shiny boosts.
//
// Prefix aliases: col, mycards
// Prefix controls:
//   Row 1 — 🔍 (search), ↕ (flip direction), Previous, Next, boosts button
//   Row 2 — Sort dropdown (copies / health / power / speed / rank)
//
// Slash controls: sort and card are options at invocation.
//   /collection              → sorted by copies descending (default)
//   /collection sort:rank    → sorted by rank descending
//   /collection card:luffy   → jump directly to Luffy (no sort/direction button)
//
// Search mode (🔍 button or card slash option):
//   Shows the single card with only a red Back button and the boosts button.
//   The direction button is HIDDEN in this mode.

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
const User = require('../../models/user');

// Stat boost calculator — applies copies boost (0.1%/copy) and shiny boost (3%)
const { computeBoosts } = require('../../utils/boosts');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const RANK_ORDER = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

const SORT_LABELS = {
  copies: 'By copies',
  health: 'By health',
  power:  'By power',
  speed:  'By speed',
  rank:   'By rank'
};

const DESC_EMOJI   = '<:descending:1533566429180330286>';
const SHINY_EMOJI  = '<:shiny:1533586974764699868>';
const BOOSTS_EMOJI = '<:boosts:1533587691055349900>';

// ─────────────────────────────────────────────
// HELPER — get the stat block for a card at a given mastery level
// ─────────────────────────────────────────────
function getCardData(card, mastery) {
  if (mastery === 2) return card.M2 || card;
  if (mastery === 3) return card.M3 || card.M2 || card;
  return card;
}

// ─────────────────────────────────────────────
// HELPER — resolve a single base stat for a card at a given mastery
// ─────────────────────────────────────────────
function resolveCardStat(card, mastery, statType) {
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);
  return resolveStat(rank, statType, safeStat(cardData[statType]), card.name, mastery);
}

// ─────────────────────────────────────────────
// HELPER — compute the fully boosted value of one stat for an owned-card entry
// Used by sortOwnedCards to sort by real effective stats (including all boosts).
//
// entry = { card, copies, mastery, isShiny }
// ─────────────────────────────────────────────
function getBoostedStat(entry, statType) {
  // Use the stored mastery level directly — do not derive it from copy count
  const mastery  = entry.mastery ?? 1;
  const base     = resolveCardStat(entry.card, mastery, statType);
  const copyPct  = entry.copies * 0.001;       // 0.1% per copy
  const shinyPct = entry.isShiny ? 0.03 : 0;  // 3% if shiny
  // Round each boost up separately, then sum — matches computeBoosts() logic
  return base + Math.ceil(base * copyPct) + Math.ceil(base * shinyPct);
}

// ─────────────────────────────────────────────
// HELPER — sort an owned-card list
// Each entry is: { card, copies, isShiny }
//
// Stat sorts (health / power / speed) use fully boosted values so that a
// high-copy or shiny card ranks correctly against others.
// ─────────────────────────────────────────────
function sortOwnedCards(ownedList, sortMode, isAscending = false) {
  const copy = [...ownedList];

  let sorted;

  if (sortMode === 'copies') {
    sorted = copy.sort((a, b) => b.copies - a.copies);
  } else if (sortMode === 'rank') {
    sorted = copy.sort((a, b) => {
      const rankA = safeRank(a.card.rank);
      const rankB = safeRank(b.card.rank);
      return RANK_ORDER.indexOf(rankA) - RANK_ORDER.indexOf(rankB);
    });
  } else {
    // health / power / speed — sort by the fully boosted stat value
    sorted = copy.sort((a, b) => getBoostedStat(b, sortMode) - getBoostedStat(a, sortMode));
  }

  return isAscending ? sorted.reverse() : sorted;
}

// ─────────────────────────────────────────────
// HELPER — build the boost breakdown text for the boosts button popup
// Shows the per-source stat gains: Copies always shown; Shiny only if shiny.
// ─────────────────────────────────────────────
function buildBoostMessage(entry) {
  const { card, copies, mastery: storedMastery, isShiny } = entry;
  // Use the stored mastery level — do not derive it from copy count
  const mastery  = storedMastery ?? 1;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), card.name, mastery);
  const basePower  = resolveStat(rank, 'power',  safeStat(cardData.power),  card.name, mastery);
  const baseSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  card.name, mastery);

  const { copyBoost, shinyBoost } = computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny);

  const lines = ['**Active Boosts**'];
  lines.push(`Copies: \`+${copyBoost.health}hp\`, \`+${copyBoost.power}pwr\`, \`+${copyBoost.speed}spd\``);
  if (isShiny) {
    lines.push(`Shiny: \`+${shinyBoost.health}hp\`, \`+${shinyBoost.power}pwr\`, \`+${shinyBoost.speed}spd\``);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────
// HELPER — build the embed for one owned card
//
// Mastery is derived from entry.copies (1 copy = M1, 2 = M2, 3+ = M3).
// Stats shown are the BOOSTED values (copies + shiny), not the base values.
// info/allcards show base stats; collection always shows what you actually own.
// ─────────────────────────────────────────────
function buildCardEmbed(entry, footerText, user) {
  const { card, copies, mastery: storedMastery, isShiny } = entry;
  // Use the stored mastery level — do not derive it from copy count
  const mastery  = storedMastery ?? 1;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  if (rank !== (cardData.rank || card.rank)) {
    console.warn(`[Collection] "${card.name}" M${mastery} has invalid rank "${cardData.rank}". Using fallback D.`);
  }

  const visual = rankConfig[rank][`M${mastery}`];

  // Resolve base stats at the owned mastery level
  const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), card.name, mastery);
  const basePower  = resolveStat(rank, 'power',  safeStat(cardData.power),  card.name, mastery);
  const baseSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  card.name, mastery);

  // Apply copies + shiny boosts to get the displayed stat values
  const { health, power, speed } = computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny);

  // Shiny emoji appears before the card name when the card is shiny
  const title = isShiny ? `${SHINY_EMOJI} ${card.name}` : card.name;

  return {
    title,
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
    color:     visual.color,
    thumbnail: { url: visual.icon },
    image:     { url: cardData.image }
  };
}

// ─────────────────────────────────────────────
// HELPER — normal-mode footer text
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'}`;
}

// ─────────────────────────────────────────────
// HELPER — search-mode footer text
// ─────────────────────────────────────────────
function searchFooter(cardName) {
  return `Viewing: ${cardName}`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
//
// Nav row has 5 buttons (Discord maximum per row):
//   🔍 search | ↕ direction | Previous | Next | boosts
// PREFIX also gets a sort dropdown on a second row.
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, isSlash, isAscending = false) {
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('col_search')
      .setEmoji('<:magnifyingglass:1532884937294741645>')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('col_desc')
      .setEmoji(DESC_EMOJI)
      .setStyle(isAscending ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('col_prev')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),

    new ButtonBuilder()
      .setCustomId('col_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= total - 1),

    // Boosts button — grey icon-only button, always present
    new ButtonBuilder()
      .setCustomId('col_boosts')
      .setEmoji(BOOSTS_EMOJI)
      .setStyle(ButtonStyle.Secondary)
  );

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
// HELPER — components for search (single-card) mode
// Back button + boosts button. No direction button.
// ─────────────────────────────────────────────
function buildSearchComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('col_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('col_boosts')
        .setEmoji(BOOSTS_EMOJI)
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

// ─────────────────────────────────────────────
// COMMAND EXPORT
// ─────────────────────────────────────────────
module.exports = {
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

      if (slashCard && slashSort) {
        return interactionOrMessage.reply({
          content: 'You cannot use **card** together with **sort**. Pick one.',
          flags: 64
        });
      }
    }

    // ── STEP 2: Load owned cards ──
    const userData = await User.findOne({ userId: user.id });

    // Build the owned list — each entry carries the card object, copy count, and shiny flag.
    // The shiny flag comes from the DB entry (defaults to false if not set on older entries).
    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue;
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue;
      ownedList.push({
        card,
        copies:  entry.amount,
        // Use the stored mastery level (defaults to 1 for any card that predates this field)
        mastery: entry.mastery ?? 1,
        isShiny: entry.shiny ?? false
      });
    }

    if (ownedList.length === 0) {
      return interactionOrMessage.reply({
        content: `You don't own any cards yet. Use \`op pull\` to start pulling`,
        allowedMentions: { repliedUser: false }
      });
    }

    // ── STEP 3: Initial state ──
    let sortMode     = slashSort || 'power';
    let isAscending  = false;
    let currentPage  = 0;
    let isSearchMode = false;
    let searchEntry  = null;

    let sortedList = sortOwnedCards(ownedList, sortMode, isAscending);

    // ── STEP 4: Handle 'card' slash option — enter search mode immediately ──
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

    // ── STEP 5: Build initial embed and components ──
    let embed, components;

    if (isSearchMode) {
      embed      = buildCardEmbed(searchEntry, searchFooter(searchEntry.card.name), user);
      components = buildSearchComponents();
    } else {
      embed      = buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user);
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending);
    }

    // ── STEP 6: Send the initial message ──
    const payload = { embeds: [embed], components, fetchReply: true };
    let response;

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // ── STEP 7: Interaction collector ──
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      collector.resetTimer();

      // ── NEXT ──
      if (interaction.customId === 'col_next') {
        currentPage = Math.min(sortedList.length - 1, currentPage + 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'col_prev') {
        currentPage = Math.max(0, currentPage - 1);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── DIRECTION TOGGLE ──
      else if (interaction.customId === 'col_desc') {
        isAscending = !isAscending;
        currentPage = 0;
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0;
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending);
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── BOOSTS BUTTON — show an ephemeral breakdown of all active stat boosts ──
      else if (interaction.customId === 'col_boosts') {
        // currentEntry is the card currently displayed — either the search result or the
        // current page in the sorted list
        const currentEntry = isSearchMode ? searchEntry : sortedList[currentPage];
        return interaction.reply({ content: buildBoostMessage(currentEntry), flags: 64 });
      }

      // ── SEARCH BUTTON (🔍) ──
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

        try {
          const submit = await interaction.awaitModalSubmit({
            time:   30000,
            filter: i => i.customId === 'col_search_modal' && i.user.id === user.id
          });

          const query = submit.fields.getTextInputValue('col_search_query').toLowerCase().trim();

          const found = ownedList.find(e =>
            e.card.name.toLowerCase().includes(query) ||
            e.card.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            await submit.reply({ content: `You don't own a card matching **${query}**`, flags: 64 });
            return;
          }

          isSearchMode = true;
          searchEntry  = found;

          await submit.update({
            embeds:     [buildCardEmbed(searchEntry, searchFooter(searchEntry.card.name), user)],
            components: buildSearchComponents()
          });

        } catch {
          // Modal dismissed or timed out — leave the embed unchanged
        }
      }

      // ── BACK BUTTON ──
      else if (interaction.customId === 'col_back') {
        isSearchMode = false;
        searchEntry  = null;
        currentPage  = 0;
        await interaction.update({
          embeds:     [buildCardEmbed(sortedList[currentPage], normalFooter(currentPage, sortedList.length, sortMode), user)],
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }
    });

    // After 2 minutes of inactivity, remove buttons and mark as expired
    collector.on('end', async () => {
      try {
        const latestResponse = await response.fetch();
        const expiredEmbed = EmbedBuilder
          .from(latestResponse.embeds[0])
          .setFooter({ text: 'expired' });
        await latestResponse.edit({ embeds: [expiredEmbed], components: [] });
      } catch {
        // Message may have been deleted — silently ignore
      }
    });
  }
};
