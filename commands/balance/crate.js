// ─────────────────────────────────────────────
// CRATE COMMAND
// ─────────────────────────────────────────────
// Crates award Beli and Gems. Each Crate gets its own independent roll.

const { EmbedBuilder } = require('discord.js');
const User = require('../../models/user');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');

const CRATE = INVENTORY_ITEMS.crate;
const GEM = INVENTORY_ITEMS.gem;

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

function getRequestedAmount(interactionOrMessage) {
  if (isSlash(interactionOrMessage)) {
    return interactionOrMessage.options.getString('amount') || '1';
  }
  return interactionOrMessage.content.trim().split(/\s+/).slice(2)[0] || '1';
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pluralize(amount, singular, plural = `${singular}s`) {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

function buildRewards(amount) {
  let beli = 0;
  let gems = 0;

  for (let index = 0; index < amount; index += 1) {
    beli += randomInteger(1000, 2500);
    gems += randomInteger(1, 3);
  }

  return { beli, gems };
}

function buildOpenedEmbed(rewards, amount, user) {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Crate opened')
    .setDescription(
      `<:whitearrow:1532531439445344547> <:SilverCoin:1534757841867374782> ` +
      `Beli **${rewards.beli.toLocaleString('en-US')}**\n` +
      `<:whitearrow:1532531439445344547> ${GEM.emoji} ` +
      `**${rewards.gems}x** ${rewards.gems === 1 ? GEM.name : 'Gems'}`
    )
    .setFooter({
      text: `${pluralize(amount, CRATE.name, 'Crates')} opened by ${user.username}`
    });
}

module.exports = {
  name: 'crate',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const requested = String(getRequestedAmount(interactionOrMessage)).trim().toLowerCase();
    const userData = await User.findOne({ userId: user.id });
    const owned = Number(userData?.[CRATE.field]) || 0;

    if (requested === 'all') {
      if (owned < 1) return reply(interactionOrMessage, `You do not have any ${CRATE.name}s`);
    } else if (!/^[1-9]\d*$/.test(requested)) {
      return reply(interactionOrMessage, 'Amount must be a positive whole number or `all`');
    }

    const amount = requested === 'all' ? owned : Number(requested);
    if (amount > owned) {
      return reply(
        interactionOrMessage,
        `You only have **${owned}** ${CRATE.emoji} ${owned === 1 ? CRATE.name : 'Crates'}`
      );
    }

    const rewards = buildRewards(amount);
    const result = await User.collection.updateOne(
      { userId: user.id, [CRATE.field]: { $gte: amount } },
      {
        $inc: {
          [CRATE.field]: -amount,
          balance: rewards.beli,
          [GEM.field]: rewards.gems
        }
      }
    );

    if (result.matchedCount !== 1) {
      return reply(interactionOrMessage, 'Your Crate count changed, please try again');
    }

    const openingContent =
      `Opening **${amount}x ${CRATE.emoji} ` +
      `${amount === 1 ? CRATE.name : 'Crates'} <a:loading:1535021695167889429>**`;

    let response;
    if (isSlash(interactionOrMessage)) {
      response = await interactionOrMessage.reply({
        content: openingContent,
        fetchReply: true
      });
    } else {
      response = await interactionOrMessage.channel.send({
        content: openingContent,
        allowedMentions: { parse: [] }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    const embed = buildOpenedEmbed(rewards, amount, user);
    if (isSlash(interactionOrMessage)) {
      return interactionOrMessage.editReply({ content: '', embeds: [embed] });
    }
    return response.edit({ content: '', embeds: [embed] });
  }
};