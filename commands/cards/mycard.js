// discord.js components needed for this command
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

// Card data and helper functions from the central card library
const { cards, rankConfig, resolveStat, safeRank, safeStat } = require('../../data/cards');

// The User model so we can look up which cards the player owns
const User = require('../../models/user');

// Stat boost calculator — applies copies boost (0.1%/copy) and shiny boost (3%)
const { computeBoosts } = require('../../utils/boosts');

// ─── EMOJI CONSTANTS ───
// SHINY_EMOJI appears before the card name when the card is shiny.
// BOOSTS_EMOJI is used as the icon on the active-boosts button.
const SHINY_EMOJI  = '<:shiny:1533586974764699868>';
const BOOSTS_EMOJI = '<:boosts:1533587691055349900>';

module.exports = {
  // --- SLASH COMMAND DEFINITION ---
  data: new SlashCommandBuilder()
    .setName('mycard')
    .setDescription('Check info about a card you own')
    .addStringOption(option =>
      option.setName('query').setDescription('Name or alias of the card').setRequired(true)
    ),

  // --- PREFIX COMMAND DEFINITION ---
  name: 'mycard',
  aliases: ['mc'], // 'op mc luffy' works the same as 'op mycard luffy'

  async execute(interactionOrMessage, args) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // --- STEP 1: Figure out what the user searched for ---
    let query = '';
    if (interactionOrMessage.isChatInputCommand?.()) {
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

    const search = query.toLowerCase();

    // --- STEP 2: Find the card in the card library ---
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

    // --- STEP 3: Check if the user owns this card ---
    const userData  = await User.findOne({ userId: user.id });
    const copyEntry = userData?.cardCopies?.find(c => c.cardName === foundCard.name);
    const ownedCopies = copyEntry?.amount ?? 0;
    // isShiny is stored in the DB entry; defaults to false if never set
    const isShiny   = copyEntry?.shiny  ?? false;

    if (ownedCopies === 0) {
      return interactionOrMessage.reply({
        content: `You do not own **${foundCard.name}**`,
        allowedMentions: { repliedUser: false }
      });
    }

    // --- STEP 4: Determine mastery level ---
    // 1 copy → M1, 2 copies → M2, 3+ copies → M3
    const masteryLevel = Math.min(ownedCopies, 3);

    // --- STEP 5: Pick the right stat block for their mastery ---
    let cardData = foundCard;              // defaults to M1
    if (masteryLevel === 2) cardData = foundCard.M2;
    if (masteryLevel === 3) cardData = foundCard.M3;

    const rank = safeRank(cardData.rank);
    if (rank !== cardData.rank) {
      console.warn(`[MyCard] "${foundCard.name}" (M${masteryLevel}) has invalid rank "${cardData.rank}". Using fallback D.`);
    }

    // --- STEP 6: Resolve the base stats for this mastery ---
    // resolveStat gives a fixed number for each card name + mastery + stat combo.
    const basePower  = resolveStat(rank, 'power',  safeStat(cardData.power),  foundCard.name, masteryLevel);
    const baseHealth = resolveStat(rank, 'health', safeStat(cardData.health), foundCard.name, masteryLevel);
    const baseSpeed  = resolveStat(rank, 'speed',  safeStat(cardData.speed),  foundCard.name, masteryLevel);

    // --- STEP 7: Apply copies + shiny boosts ---
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

    // --- STEP 8: Build the embed ---
    // Shiny emoji appears before the name if the card is shiny
    const cardTitle = isShiny ? `${SHINY_EMOJI} ${foundCard.name}` : foundCard.name;

    const embed = {
      title: cardTitle,
      description: [
        `${cardData.title}`,
        ` `,
        `**Rank:** ${cardData.rank}`,
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
      image:     { url: cardData.image }
    };

    // --- STEP 9: Build the boosts button ---
    // Grey (Secondary) button with only the boosts emoji — no text label.
    // It opens an ephemeral breakdown of how the card's stats are being boosted.
    const boostsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mc_boosts')
        .setEmoji(BOOSTS_EMOJI)
        .setStyle(ButtonStyle.Secondary)
    );

    // --- STEP 10: Send the message ---
    // fetchReply: true gives us the message object so we can attach a collector
    const payload = { embeds: [embed], components: [boostsRow], fetchReply: true };
    let response;
    if (interactionOrMessage.isChatInputCommand?.()) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // --- STEP 11: Listen for the boosts button ---
    // 60-second timeout — same as the info command
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      // Only the person who ran the command can click the button
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      if (interaction.customId === 'mc_boosts') {
        // Build the boost breakdown text.
        // The Copies line always shows (every card has >= 1 copy, so boost is always >= 1
        // due to Math.ceil). The Shiny line only appears if the card is actually shiny.
        const lines = ['**Active Boosts**'];
        lines.push(`Copies: \`+${copyBoost.health}hp\`, \`+${copyBoost.power}pwr\`, \`+${copyBoost.speed}spd\``);
        if (isShiny) {
          lines.push(`Shiny: \`+${shinyBoost.health}hp\`, \`+${shinyBoost.power}pwr\`, \`+${shinyBoost.speed}spd\``);
        }
        // flags: 64 = ephemeral — only visible to the user who clicked
        return interaction.reply({ content: lines.join('\n'), flags: 64 });
      }
    });

    // After 60 seconds of inactivity, remove the button and mark the footer as expired.
    // This matches the expiry behaviour of all other button-based card embeds.
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
