// ─────────────────────────────────────────────
// DRINK COMMAND — use Wine to reset the AI battle cooldown
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');

const WINE = INVENTORY_ITEMS.wine;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drink')
    .setDescription('Use Wine to reset your battle cooldown'),

  name: 'drink',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;

    // Atomically spend one Wine and clear the battle cooldown. The quantity
    // check prevents two simultaneous commands from spending the same item.
    const result = await User.collection.updateOne(
      { userId: user.id, [WINE.field]: { $gte: 1 } },
      { $inc: { [WINE.field]: -1 }, $set: { lastBattleTime: null } }
    );

    if (result.matchedCount !== 1) {
      const content = `You don't have any ${WINE.emoji} Wine`;
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
        content: `You drank 1 ${WINE.emoji} Wine and reset your battle cooldown`,
        flags: 64
      });
    }

    return interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};