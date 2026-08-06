// ─────────────────────────────────────────────
// DRINK COMMAND — use Wine to reset the AI battle cooldown
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');

const WINE = INVENTORY_ITEMS.wine;
const BATTLE_COOLDOWN_MS = 30 * 60 * 1000;

function isSlash(interactionOrMessage) {
  return interactionOrMessage.isChatInputCommand?.();
}

function reply(interactionOrMessage, content) {
  if (isSlash(interactionOrMessage)) {
    return interactionOrMessage.reply({ content, flags: 64 });
  }

  return interactionOrMessage.reply({
    content,
    allowedMentions: { repliedUser: false }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('drink')
    .setDescription('Use Wine to reset your battle cooldown'),

  name: 'drink',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const now = Date.now();
    const cooldownStartedAfter = new Date(now - BATTLE_COOLDOWN_MS);
    const userData = await User.findOne({ userId: user.id });

    if (!userData?.lastBattleTime ||
        userData.lastBattleTime.getTime() <= cooldownStartedAfter.getTime()) {
      return reply(
        interactionOrMessage,
        'Your battle cooldown is already ready'
      );
    }

    // Require both an available Wine and an active cooldown in the update.
    // This prevents two simultaneous commands from spending the same item or
    // using Wine after another command has already reset the cooldown.
    const result = await User.collection.updateOne(
      {
        userId: user.id,
        [WINE.field]: { $gte: 1 },
        lastBattleTime: { $gt: cooldownStartedAfter }
      },
      { $inc: { [WINE.field]: -1 }, $set: { lastBattleTime: null } }
    );

    if (result.matchedCount !== 1) {
      return reply(interactionOrMessage, `You don't have any ${WINE.emoji} Wine`);
    }

    if (isSlash(interactionOrMessage)) {
      return interactionOrMessage.reply({
        content: `You drank 1 ${WINE.emoji} Wine and reset your battle cooldown`,
        flags: 64
      });
    }

    return interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};