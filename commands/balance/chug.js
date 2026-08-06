// ─────────────────────────────────────────────
// CHUG COMMAND — use Beer to reset the duel cooldown
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');

const BEER = INVENTORY_ITEMS.beer;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chug')
    .setDescription('Use Beer to reset your duel cooldown'),

  name: 'chug',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // Atomically spend one Beer and clear the duel reward cooldown. This is
    // the same field used by the existing owner duel reset command.
    const result = await User.collection.updateOne(
      { userId: user.id, [BEER.field]: { $gte: 1 } },
      { $inc: { [BEER.field]: -1 }, $set: { lastDuelRewardAt: null } }
    );

    if (result.matchedCount !== 1) {
      const content = `You don't have any ${BEER.emoji} Beer`;
      if (interactionOrMessage.isChatInputCommand?.()) {
        return interactionOrMessage.reply({ content, flags: 64 });
      }
      return interactionOrMessage.reply({
        content,
        allowedMentions: { repliedUser: false }
      });
    }

    if (interactionOrMessage.isChatInputCommand?.()) {
      return interactionOrMessage.reply({
        content: `You chugged 1 ${BEER.emoji} Beer and reset your duel cooldown`,
        flags: 64
      });
    }

    return interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};