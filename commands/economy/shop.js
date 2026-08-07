const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder
} = require('discord.js');

const SHOP_PAGES = [
  'https://i.imgur.com/cZ9sTGt.png',
  'https://i.imgur.com/8oqHj72.png'
];

const SHOP_PAGE_COUNT = SHOP_PAGES.length;

// Download the current page so Discord receives it as a normal image
// attachment instead of rendering it inside an embed.
async function getShopImage(page) {
  const response = await fetch(SHOP_PAGES[page]);
  if (!response.ok) {
    throw new Error(`Shop image request failed with status ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// Build the plain image message and its navigation row.
function buildShopPayload(page, imageBuffer, expired = false) {
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
    files: [
      new AttachmentBuilder(imageBuffer, {
        name: `shop-page-${page + 1}.png`
      })
    ],
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
    const imageBuffer = await getShopImage(page);

    const payload = {
      ...buildShopPayload(page, imageBuffer),
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

      const nextImageBuffer = await getShopImage(page);
      await interaction.update(buildShopPayload(page, nextImageBuffer));
    });

    // Remove the controls when the image navigation session expires.
    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  }
};