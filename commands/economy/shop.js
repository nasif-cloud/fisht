const { SlashCommandBuilder } = require('discord.js');
const { renderShopImage } = require('../../utils/shopImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the shop'),

  name: 'shop',
  aliases: ['store'],

  async execute(interactionOrMessage) {
    const image = await renderShopImage();
    const payload = {
      files: [{ attachment: image, name: 'shop.png' }]
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      return interactionOrMessage.reply(payload);
    }

    return interactionOrMessage.channel.send(payload);
  }
};