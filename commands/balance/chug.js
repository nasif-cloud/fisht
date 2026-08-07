// ─────────────────────────────────────────────
// CHUG COMMAND — use Beer to reset the duel cooldown
// ─────────────────────────────────────────────

const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');
const { getLastDailyReset } = require('../../utils/quests');

const BEER = INVENTORY_ITEMS.beer;

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
    .setName('chug')
    .setDescription('Use Beer to reset your duel cooldown'),

  name: 'chug',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const lastDailyReset = getLastDailyReset(new Date());
    const userData = await User.findOne({ userId: user.id });

    if (!userData?.lastDuelRewardAt ||
        userData.lastDuelRewardAt < lastDailyReset) {
      return reply(
        interactionOrMessage,
        'Your duel cooldown is already ready'
      );
    }

    // Require both an available Beer and an active daily cooldown in the
    // update so concurrent commands cannot spend the same item twice.
    const result = await User.collection.updateOne(
      {
        userId: user.id,
        [BEER.field]: { $gte: 1 },
        lastDuelRewardAt: { $gte: lastDailyReset }
      },
      { $inc: { [BEER.field]: -1 }, $set: { lastDuelRewardAt: null } }
    );

    if (result.matchedCount !== 1) {
      return reply(interactionOrMessage, `You don't have any ${BEER.emoji} Beer`);
    }

    if (isSlash(interactionOrMessage)) {
      return interactionOrMessage.reply({
        content: `You chugged 1 ${BEER.emoji} Beer and reset your duel cooldown`,
        flags: 64
      });
    }

    return interactionOrMessage.react('<:Success:1533154745731256531>');
  }
};