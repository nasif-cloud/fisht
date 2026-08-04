const { SlashCommandBuilder } = require('discord.js');
const User = require('../../models/user');
const shopItems = require('../../data/shop');

const SUCCESS_REACTION = '<:Success:1533154745731256531>';

function normalizeItemQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findShopItem(query) {
  const normalized = normalizeItemQuery(query);
  return shopItems.find(item =>
    item.id === normalized ||
    normalizeItemQuery(item.name) === normalized ||
    (item.aliases || []).some(alias => normalizeItemQuery(alias) === normalized)
  );
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 1;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1) return null;
  return amount;
}

function formatCost(value) {
  return value.toLocaleString('en-US');
}

function getPrefixArguments(message) {
  const parts = message.content.trim().split(/\s+/);
  const itemAndAmount = parts.slice(2);
  const lastPart = itemAndAmount[itemAndAmount.length - 1];
  const hasAmount = /^\d+$/.test(lastPart || '');

  return {
    itemQuery: (hasAmount ? itemAndAmount.slice(0, -1) : itemAndAmount).join(' '),
    amountText: hasAmount ? lastPart : undefined
  };
}

function slashItemQuery(interaction) {
  return interaction.options.getString('item');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('The item to buy')
        .setRequired(true)
        .addChoices(...shopItems.map(item => ({ name: item.name, value: item.id })))
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many to buy')
        .setMinValue(1)
        .setRequired(false)
    ),

  name: 'buy',
  aliases: ['purchase'],

  async execute(interactionOrMessage) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const prefixArguments = isSlash ? null : getPrefixArguments(interactionOrMessage);
    const itemQuery = isSlash
      ? slashItemQuery(interactionOrMessage)
      : prefixArguments.itemQuery;
    const amountText = isSlash
      ? interactionOrMessage.options.getInteger('amount') ?? 1
      : prefixArguments.amountText;

    const item = findShopItem(itemQuery);
    const amount = parseAmount(amountText);

    if (!item) {
      const content = `That item isn't available. Use \`op shop\` to view the shop.`;
      return isSlash
        ? interactionOrMessage.reply({ content, flags: 64 })
        : interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    if (!amount) {
      const content = 'Amount must be a whole number greater than 0.';
      return isSlash
        ? interactionOrMessage.reply({ content, flags: 64 })
        : interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    const totalCost = item.price * amount;
    if (!Number.isSafeInteger(totalCost)) {
      const content = 'That purchase amount is too large.';
      return isSlash
        ? interactionOrMessage.reply({ content, flags: 64 })
        : interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    // The balance predicate and increment happen in one MongoDB operation,
    // preventing concurrent purchases from spending the same Berries twice.
    const updatedUser = await User.findOneAndUpdate(
      { userId: user.id, balance: { $gte: totalCost } },
      {
        $inc: {
          balance: -totalCost,
          [item.inventoryField]: item.amountPerPurchase * amount
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      const currentUser = await User.findOne({ userId: user.id });
      const balance = Number(currentUser?.balance) || 0;
      const content =
        `You need **${formatCost(totalCost)}** <:money:1532532493578928178> Berries, ` +
        `but you only have **${formatCost(balance)}**`;
      return isSlash
        ? interactionOrMessage.reply({ content, flags: 64 })
        : interactionOrMessage.reply({ content, allowedMentions: { repliedUser: false } });
    }

    if (isSlash) {
      return interactionOrMessage.reply({
        content:
          `You bought **${amount}x ${item.name}** for **${formatCost(totalCost)}** ` +
          `<:money:1532532493578928178> Berries.\n` +
          `You now have **${formatCost(updatedUser.balance)}** Berries and ` +
          `**${updatedUser[item.inventoryField].toLocaleString('en-US')}** ${item.name}.`,
        flags: 64
      });
    }

    await interactionOrMessage.react(SUCCESS_REACTION);
  }
};