const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');

const SHOP_IMAGE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'attached_assets',
  'Joy_journey_Shop_20260804_023331_0000_1785825237727.png'
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the shop'),

  name: 'shop',
  aliases: ['store'],

  async execute(interactionOrMessage) {
    const payload = {
      files: [{ attachment: SHOP_IMAGE_PATH, name: 'shop.png' }]
    };

    if (interactionOrMessage.isChatInputCommand?.()) {
      return interactionOrMessage.reply(payload);
    }

    return interactionOrMessage.channel.send(payload);
  }
};