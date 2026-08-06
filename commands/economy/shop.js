const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder
} = require('discord.js');

const SHOP_PAGES = [
  'https://i.imgur.com/cZ9sTGt.png',
  'https://i.imgur.com/8oqHj72.png'
];

const SHOP_PAGE_COUNT = SHOP_PAGES.length;

// Build the shop embed and navigation row for the current page.
function buildShopPayload(page, expired = false) {
  const embed = new EmbedBuilder().setImage(SHOP_PAGES[page]);

  if (expired) {
    embed.setFooter({ text: 'expired' });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('shop_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === SHOP_PAGE_COUNT - 1)
  );

  return {
    embeds: [embed],
    components: expired ? [] : [row]
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the shop'),

  name: 'shop',
  aliases: ['store'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    let page = 0;
    let response;

    const payload = {
      ...buildShopPayload(page),
      ...(isSlash ? { fetchReply: true } : {})
    };

    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      response = await interactionOrMessage.channel.send(payload);
    }

    // Keep the buttons active for five minutes and refresh the timer after use.
    const collector = response.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({
          content: `These aren't yours`,
          flags: MessageFlags.Ephemeral
        });
      }

      collector.resetTimer();

      if (interaction.customId === 'shop_previous') {
        page = Math.max(0, page - 1);
      } else if (interaction.customId === 'shop_next') {
        page = Math.min(SHOP_PAGE_COUNT - 1, page + 1);
      } else {
        return;
      }

      await interaction.update(buildShopPayload(page));
    });

    // Remove the controls when the shop session expires and mark the embed.
    collector.on('end', () => {
      response.edit(buildShopPayload(page, true)).catch(() => {});
    });
  }
};