// discord.js components needed for this command
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder
} = require('discord.js');

// Card data and helper functions from the central card library
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');
const { getCardAutocompleteChoices } = require('../../utils/cardAutocomplete');

// The User model so we can look up which cards the player owns
const User = require('../../models/user');

// Stat boost calculator — applies copies boost (0.3%/copy) and shiny boost (30%)
const { computeBoosts } = require('../../utils/boosts');

// Shiny image generators — produce the holographic card image and rank icon
const { generateShinyImage, generateShinyIcon } = require('../../utils/shinyImage');
const {
  getCardImagePayload,
  getNormalizedBuffer
} = require('../../utils/cardImage');

// ─── EMOJI CONSTANTS ───
// SHINY_EMOJI appears before the card name when the card is shiny.
// BOOSTS_EMOJI is used as the icon on the active-boosts button.
const SHINY_EMOJI  = `<:holo:1533666993637687466>`;
const BOOSTS_EMOJI = `<:boosts:1533587691055349900>`;

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('mycard')
    .setDescription('Check info about a card you own')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Name or alias of the card')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'mycard',
  aliases: ['mc'], // 'op mc luffy' works the same as 'op mycard luffy'

  // Supplies card-name suggestions while a user types /mycard query
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    return interaction.respond(getCardAutocompleteChoices(cards, focused));
  },

  async execute(interactionOrMessage, args) {
    const user    = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();

    // --- STEP 1: Figure out what the user searched for ---
    let query = '';
    if (isSlash) {
      query = interactionOrMessage.options.getString('query');
    } else {
      if (args) {
        query = args.join(' ');
      } else {
        // "op mycard monkey d luffy" → remove "op" and "mycard", keep "monkey d luffy"
        query = interactionOrMessage.content.split(' ').slice(2).join(' ');
      }
    }

    if (!query) {
      return interactionOrMessage.reply({
        content: 'Please provide a valid card name.',
        allowedMentions: { repliedUser: false }
      });
    }

    // --- STEP 2: Find the card in the card library ---
    // This is synchronous, so it can happen before we defer.
    const search    = query.toLowerCase();
    const foundCard = cards.find(c =>
      c.name.toLowerCase().includes(search) ||
      c.aliases.some(alias => alias.toLowerCase().includes(search))
    );

    if (!foundCard) {
      return interactionOrMessage.reply({
        content: `**${query}** is not a valid card`,
        allowedMentions: { repliedUser: false }
      });
    }

    // --- STEP 3: Defer slash commands immediately before any async work ---
    // Discord requires a response within 3 seconds. Deferring tells Discord
    // "I got this — I'll send the actual content shortly." We can then take
    // as long as we need to load from the database and generate shiny images.
    // Prefix commands have no time limit, so they don't need deferring.
    if (isSlash) await interactionOrMessage.deferReply();

    // --- STEP 4: Check if the user owns this card ---
    const userData  = await User.findOne({ userId: user.id });
    const copyEntry = userData?.cardCopies?.find(c => c.cardName === foundCard.name);
    const ownedCopies = copyEntry?.amount ?? 0;
    // isShiny is stored in the DB entry; defaults to false if never set
    const isShiny   = copyEntry?.shiny ?? false;

    if (ownedCopies === 0) {
      const notOwned = {
        content: `You do not own **${foundCard.name}**`,
        allowedMentions: { repliedUser: false }
      };
      // For slash: we already deferred, so we must use editReply instead of reply
      return isSlash
        ? interactionOrMessage.editReply(notOwned)
        : interactionOrMessage.reply(notOwned);
    }

    // --- STEP 5: Determine mastery level ---
    // Mastery is stored separately from copy count — owning 3+ copies does NOT mean M3.
    // The mastery field defaults to 1 for any card that predates this field being added.
    const masteryLevel = copyEntry.mastery ?? 1;

    // --- STEP 6: Pick the right stat block for their mastery ---
    let cardData = foundCard;              // defaults to M1
    if (masteryLevel === 2) cardData = foundCard.M2;
    if (masteryLevel === 3) cardData = foundCard.M3;

    const rank = safeRank(cardData.rank);
    if (rank !== cardData.rank) {
      console.warn(`[MyCard] "${foundCard.name}" (M${masteryLevel}) has invalid rank "${cardData.rank}". Using fallback D.`);
    }

    // --- STEP 7: Resolve the base stats for this mastery ---
    // resolveStat gives a fixed number for each card name + mastery + stat combo.
    const basePower  = resolveStat(rank, 'power',  safeStat(cardData.power),  foundCard.name, masteryLevel);
    const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), foundCard.name, masteryLevel);
    const baseSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  foundCard.name, masteryLevel);

    // --- STEP 8: Apply copies + shiny boosts ---
    // computeBoosts returns both the final boosted stats and a per-source breakdown.
    // The breakdown is saved here so the boosts button can display it.
    const {
      health: finalHealth,
      power:  finalPower,
      speed:  finalSpeed,
      copyBoost,
      shinyBoost
    } = computeBoosts(baseHealth, basePower, baseSpeed, ownedCopies, isShiny);

    const visual = rankConfig[rank][`M${masteryLevel}`];

    const normalCardImageUrl = cardData.image || foundCard.image;

    // --- STEP 9: Build the embed and final image before sending ---
    const cardTitle = isShiny ? `${SHINY_EMOJI} ${foundCard.name}` : foundCard.name;

    const embed = {
      title: cardTitle,
      description: [
        `${cardData.title}`,
        ` `,
        `**Health:** ${finalHealth}`,
        `**Power:** ${finalPower}`,
        `**Speed:** ${finalSpeed}`,
        `**Copies:** ${ownedCopies}`
      ].join('\n'),
      footer: {
        icon_url: user.displayAvatarURL({ dynamic: true }),
        text: `Mastery ${masteryLevel}/3`
      },
      color:     visual.color,
      thumbnail: { url: visual.icon },
      image:     { url: normalCardImageUrl }
    };

    // --- STEP 11: Build the boosts button ---
    // Grey (Secondary) button with only the boosts emoji — no text label.
    // It opens an ephemeral breakdown of how the card's stats are being boosted.
    const boostsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mc_boosts')
        .setEmoji(BOOSTS_EMOJI)
        .setLabel('Boosts')
        .setStyle(ButtonStyle.Secondary)
    );

    // --- STEP 11: Prepare the final image before sending ---
    let finalEmbed = embed;
    let imageFiles = [];
    if (isShiny) {
      const [cardBuf, iconBuf] = await Promise.all([
        generateShinyImage(cardData.image, foundCard.name),
        generateShinyIcon(visual.icon)
      ]);
      const finalCardBuffer = await getNormalizedBuffer(
        cardBuf,
        `shiny:${cardData.image}`
      );
      finalEmbed = {
        ...embed,
        thumbnail: { url: 'attachment://shiny_icon.png' },
        image: { url: 'attachment://shiny_card.jpg' }
      };
      imageFiles = [
        new AttachmentBuilder(finalCardBuffer, { name: 'shiny_card.jpg' }),
        new AttachmentBuilder(iconBuf, { name: 'shiny_icon.png' })
      ];
    } else {
      const imagePayload = await getCardImagePayload(normalCardImageUrl);
      finalEmbed = { ...embed, image: { url: imagePayload.imageUrl } };
      imageFiles = imagePayload.files.map(file =>
        new AttachmentBuilder(file.attachment, { name: file.name })
      );
    }

    // --- STEP 12: Send the complete message once ---
    // Slash: use editReply (because we deferred in step 3).
    // Prefix: use channel.send (no defer was needed, no time limit).
    let response;
    const payload = {
      embeds: [finalEmbed],
      components: [boostsRow],
      files: imageFiles
    };

    if (isSlash) {
      response = await interactionOrMessage.editReply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // --- STEP 13: Listen for the boosts button ---
    // 60-second timeout — same as the info command.
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can click the button
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      if (interaction.customId === 'mc_boosts') {
        // Build the boost breakdown text.
        // The Copies line always shows. The Shiny line only appears if the card is shiny.
        const lines = ['**Active Boosts**'];
        lines.push(`Copies: \`+${copyBoost.health}hp\`, \`+${copyBoost.power}pwr\`, \`+${copyBoost.speed}spd\``);
        if (isShiny) {
          lines.push(`Shiny: \`+${shinyBoost.health}hp\`, \`+${shinyBoost.power}pwr\`, \`+${shinyBoost.speed}spd\``);
        }
        // flags: 64 = ephemeral — only visible to the user who clicked
        return interaction.reply({ content: lines.join('\n'), flags: 64 });
      }
    });

    // After 60 seconds of inactivity, remove the button.
    //
    // When an embed uses an uploaded card image, editing the embeds payload can
    // detach that image and render it below the message. Leave attachment-backed
    // embeds untouched and remove only the controls.
    collector.on('end', async () => {
      try {
        const latestResponse = await response.fetch();
        const imageUrl = latestResponse.embeds[0]?.image?.url ?? '';

        if (imageUrl.includes('/attachments/')) {
          console.log(`[MyCard] Expiry: attachment-backed card — removing components only`);
          await latestResponse.edit({ components: [] });
        } else {
          console.log(`[MyCard] Expiry: external-image card — setting expired footer`);
          const expiredEmbed = EmbedBuilder
            .from(latestResponse.embeds[0])
            .setFooter({ text: 'expired' });
          await latestResponse.edit({ embeds: [expiredEmbed], components: [] });
        }
      } catch {
        // Message may have been deleted — silently ignore
      }
    });
  }
};
