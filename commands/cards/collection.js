// ─────────────────────────────────────────────
// COLLECTION COMMAND
// ─────────────────────────────────────────────
// Shows all the cards the player personally owns, one per page.
// Supports sorting, searching, and a direction-flip button.
//
// Each card is shown at the mastery the player actually owns (M1/M2/M3),
// and all stats include copies + shiny boosts.
//
// Shiny cards display a holographic rainbow overlay on both the card image
// and the rank icon, generated on the fly via utils/shinyImage.js.
//
// IMPORTANT — interaction timing:
//   Discord gives a 3-second window to acknowledge any interaction.
//   Image generation (jimp) can take several seconds, so we always:
//     • deferReply()  for the initial slash command
//     • deferUpdate() at the very start of every button/select collector handler
//   Then edit the reply once the images are ready.
//   Prefix commands have no time limit and are handled with channel.send().

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const User = require('../../models/user');

// Stat boost calculator — applies copies boost (0.3%/copy) and shiny boost (30%)
const { computeBoosts } = require('../../utils/boosts');

// Shiny image generators — holographic overlay for card image and rank icon
const { generateShinyImage, generateShinyIcon } = require('../../utils/shinyImage');

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

const DESC_EMOJI   = `<:descending:1533566429180330286>`;
const SHINY_EMOJI  = `<:holo:1533666993637687466>`;
const BOOSTS_EMOJI = `<:boosts:1533587691055349900>`;

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
  const mastery = entry.mastery ?? 1;

  // Resolve all three base stats so we can pass them to computeBoosts
  const baseHealth = resolveCardStat(entry.card, mastery, 'health');
  const basePower  = resolveCardStat(entry.card, mastery, 'power');
  const baseSpeed  = resolveCardStat(entry.card, mastery, 'speed');

  // Use computeBoosts so sort order always matches displayed values
  const boosted = computeBoosts(baseHealth, basePower, baseSpeed, entry.copies, entry.isShiny);
  return boosted[statType]; // 'health', 'power', or 'speed'
}

// ─────────────────────────────────────────────
// HELPER — sort an owned-card list
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
    sorted = copy.sort((a, b) => getBoostedStat(b, sortMode) - getBoostedStat(a, sortMode));
  }

  return isAscending ? sorted.reverse() : sorted;
}

// ─────────────────────────────────────────────
// HELPER — build the boost breakdown text for the boosts button popup
// ─────────────────────────────────────────────
function buildBoostMessage(entry) {
  const { card, copies, mastery: storedMastery, isShiny } = entry;
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
// HELPER — build the raw embed object for one owned card
//
// imageUrl and iconUrl are optional overrides — supply attachment:// URLs here
// when the card is shiny so the uploaded files are referenced correctly.
// ─────────────────────────────────────────────
function buildCardEmbed(entry, footerText, user, imageUrl, iconUrl) {
  const { card, copies, mastery: storedMastery, isShiny } = entry;
  const mastery  = storedMastery ?? 1;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);

  if (rank !== (cardData.rank || card.rank)) {
    console.warn(`[Collection] "${card.name}" M${mastery} has invalid rank "${cardData.rank}". Using fallback D.`);
  }

  const visual = rankConfig[rank][`M${mastery}`];

  const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), card.name, mastery);
  const basePower  = resolveStat(rank, 'power',  safeStat(cardData.power),  card.name, mastery);
  const baseSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  card.name, mastery);

  const { health, power, speed } = computeBoosts(baseHealth, basePower, baseSpeed, copies, isShiny);

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
    // Use overrides (attachment://) when shiny, otherwise plain URLs
    thumbnail: { url: iconUrl  || visual.icon    },
    image:     { url: imageUrl || cardData.image }
  };
}

// ─────────────────────────────────────────────
// HELPER — resolve the full embed payload for one card, including shiny assets
//
// For non-shiny cards: returns the embed and an empty files array immediately.
// For shiny cards: generates the holographic card image and rank icon (may take
// a few seconds), attaches them as files, and uses attachment:// URLs in the embed.
//
// Returns: { embeds: [...], files: [...] }
// ─────────────────────────────────────────────
async function buildCardPayload(entry, footerText, user) {
  if (!entry.isShiny) {
    return { embeds: [buildCardEmbed(entry, footerText, user)], files: [] };
  }

  const { card, mastery: storedMastery } = entry;
  const mastery  = storedMastery ?? 1;
  const cardData = getCardData(card, mastery);
  const rank     = safeRank(cardData.rank || card.rank);
  const visual   = rankConfig[rank][`M${mastery}`];

  // Generate both images in parallel for speed
  const [cardBuf, iconBuf] = await Promise.all([
    generateShinyImage(cardData.image, card.name),
    generateShinyIcon(visual.icon)
  ]);

  const files = [
    new AttachmentBuilder(cardBuf, { name: `shiny_card.png` }),
    new AttachmentBuilder(iconBuf, { name: `shiny_icon.png` })
  ];

  return {
    embeds: [buildCardEmbed(
      entry, footerText, user,
      `attachment://shiny_card.png`,
      `attachment://shiny_icon.png`
    )],
    files
  };
}

// ─────────────────────────────────────────────
// HELPER — footer text helpers
// ─────────────────────────────────────────────
function normalFooter(page, total, sortMode) {
  return `Card ${page + 1}/${total} - ${SORT_LABELS[sortMode] || 'By copies'}`;
}
function searchFooter(cardName) {
  return `Viewing: ${cardName}`;
}

// ─────────────────────────────────────────────
// HELPER — components for normal (browsing) mode
// ─────────────────────────────────────────────
function buildNormalComponents(total, page, sortMode, isSlash, isAscending = false) {
  const navRow = new ActionRowBuilder().addComponents(
   new ButtonBuilder()
      .setCustomId('col_boosts')
      .setEmoji(BOOSTS_EMOJI)
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

    new ButtonBuilder()
      .setCustomId('col_search')
      .setEmoji('<:magnifyingglass:1532884937294741645>')
      .setStyle(ButtonStyle.Secondary),
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

      // Defer immediately — before any DB queries or image generation.
      // This tells Discord we received the command; we'll send content shortly.
      await interactionOrMessage.deferReply();
    }

    // ── STEP 2: Load owned cards ──
    const userData = await User.findOne({ userId: user.id });

    const ownedList = [];
    for (const entry of (userData?.cardCopies || [])) {
      if (!entry.amount || entry.amount <= 0) continue;
      const card = cards.find(c => c.name === entry.cardName);
      if (!card) continue;
      ownedList.push({
        card,
        copies:  entry.amount,
        mastery: entry.mastery ?? 1,
        isShiny: entry.shiny ?? false
      });
    }

    if (ownedList.length === 0) {
      const empty = {
        content: `You don't own any cards yet. Use \`op pull\` to start pulling`,
        allowedMentions: { repliedUser: false }
      };
      return isSlash
        ? interactionOrMessage.editReply(empty)
        : interactionOrMessage.reply(empty);
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
        return interactionOrMessage.editReply({
          content: `You don't own a card matching **${slashCard}**`
        });
      }

      isSearchMode = true;
      searchEntry  = found;
    }

    // ── STEP 5: Build initial embed payload and components ──
    // buildCardPayload is async — for shiny cards it generates the holographic images.
    let cardPayload, components;

    if (isSearchMode) {
      cardPayload = await buildCardPayload(searchEntry, searchFooter(searchEntry.card.name), user);
      components  = buildSearchComponents();
    } else {
      cardPayload = await buildCardPayload(
        sortedList[currentPage],
        normalFooter(currentPage, sortedList.length, sortMode),
        user
      );
      components = buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending);
    }

    // ── STEP 6: Send the initial message ──
    // Slash: editReply (already deferred in step 1).
    // Prefix: channel.send (no defer, no time limit).
    let response;
    const sendPayload = { ...cardPayload, components };

    if (isSlash) {
      response = await interactionOrMessage.editReply(sendPayload);
    } else {
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    // ── STEP 7: Interaction collector ──
    // Every handler except col_boosts and col_search MUST call deferUpdate()
    // as its very first action, before any await that could take time.
    // This acknowledges the interaction within Discord's 3-second window.
    // We then call editReply() after the slow work is done.
    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      // ── BOOSTS — ephemeral text reply, no image work, no defer needed ──
      if (interaction.customId === 'col_boosts') {
        const currentEntry = isSearchMode ? searchEntry : sortedList[currentPage];
        return interaction.reply({ content: buildBoostMessage(currentEntry), flags: 64 });
      }

      // ── SEARCH — shows a modal, which itself acknowledges the interaction ──
      if (interaction.customId === 'col_search') {
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

          // Defer the modal submit immediately — image generation takes time
          await submit.deferUpdate();

          const query = submit.fields.getTextInputValue('col_search_query').toLowerCase().trim();
          const found = ownedList.find(e =>
            e.card.name.toLowerCase().includes(query) ||
            e.card.aliases.some(a => a && a.toLowerCase().includes(query))
          );

          if (!found) {
            // Can't reply ephemerally after deferUpdate — edit the message to show the error,
            // then restore the previous card on the next interaction.
            await submit.editReply({
              embeds: [buildCardEmbed(
                isSearchMode ? searchEntry : sortedList[currentPage],
                isSearchMode ? searchFooter((isSearchMode ? searchEntry : sortedList[currentPage]).card.name) : normalFooter(currentPage, sortedList.length, sortMode),
                user
              )],
              components: isSearchMode ? buildSearchComponents() : buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending),
              files: []
            });
            return;
          }

          isSearchMode = true;
          searchEntry  = found;

          const cp = await buildCardPayload(searchEntry, searchFooter(searchEntry.card.name), user);
          await submit.editReply({ ...cp, components: buildSearchComponents() });

        } catch {
          // Modal dismissed or timed out — leave the embed unchanged
        }
        return;
      }

      // ── ALL OTHER HANDLERS — defer first, then do async work, then edit ──
      // deferUpdate() must be the very first await so Discord is notified within 3 seconds.
      await interaction.deferUpdate();
      collector.resetTimer();

      // ── NEXT ──
      if (interaction.customId === 'col_next') {
        currentPage = Math.min(sortedList.length - 1, currentPage + 1);
        const cp = await buildCardPayload(
          sortedList[currentPage],
          normalFooter(currentPage, sortedList.length, sortMode),
          user
        );
        await interaction.editReply({
          ...cp,
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── PREVIOUS ──
      else if (interaction.customId === 'col_prev') {
        currentPage = Math.max(0, currentPage - 1);
        const cp = await buildCardPayload(
          sortedList[currentPage],
          normalFooter(currentPage, sortedList.length, sortMode),
          user
        );
        await interaction.editReply({
          ...cp,
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── DIRECTION TOGGLE ──
      else if (interaction.customId === 'col_desc') {
        isAscending = !isAscending;
        currentPage = 0;
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending);
        const cp = await buildCardPayload(
          sortedList[currentPage],
          normalFooter(currentPage, sortedList.length, sortMode),
          user
        );
        await interaction.editReply({
          ...cp,
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── SORT DROPDOWN (prefix only) ──
      else if (interaction.customId === 'col_sort') {
        sortMode    = interaction.values[0];
        currentPage = 0;
        sortedList  = sortOwnedCards(ownedList, sortMode, isAscending);
        const cp = await buildCardPayload(
          sortedList[currentPage],
          normalFooter(currentPage, sortedList.length, sortMode),
          user
        );
        await interaction.editReply({
          ...cp,
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }

      // ── BACK BUTTON ──
      else if (interaction.customId === 'col_back') {
        isSearchMode = false;
        searchEntry  = null;
        currentPage  = 0;
        const cp = await buildCardPayload(
          sortedList[currentPage],
          normalFooter(currentPage, sortedList.length, sortMode),
          user
        );
        await interaction.editReply({
          ...cp,
          components: buildNormalComponents(sortedList.length, currentPage, sortMode, isSlash, isAscending)
        });
      }
    });

    // After 2 minutes of inactivity, remove buttons and mark as expired.
    // EmbedBuilder.from() picks up the Discord CDN URL that was resolved from the
    // attachment:// reference, so shiny card images remain visible after expiry.
    collector.on('end', async () => {
      try {
        const latestResponse = await response.fetch();
        const expiredEmbed = EmbedBuilder
          .from(latestResponse.embeds[0])
          .setFooter({ text: 'expired' });
        await latestResponse.edit({
          embeds: [expiredEmbed],
          components: [],
          files: cp.files
        });
      } catch {
        // Message may have been deleted — silently ignore
      }
    });
  }
};
