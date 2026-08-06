// ─────────────────────────────────────────────
// CHEST COMMAND
// ─────────────────────────────────────────────
// Each Chest gives Beli, three consumable-item rolls, and three Clone-rank
// rolls. Clones are stored as items for now and have no other behavior.

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/user');
const { CLONE_RANKS, INVENTORY_ITEMS } = require('../../data/inventoryItems');
const { rankEmojis } = require('../../data/cards');

const CHEST_EMOJI = INVENTORY_ITEMS.chest.emoji;
const CONSUMABLE_ROLLS = [
  { field: 'meat', name: 'Meat', emoji: '<:Ham:1534995152605548585>', weight: 40 },
  { field: 'wine', name: 'Wine', emoji: '<:Wine:1534994973835923706>', weight: 50 },
  { field: 'beer', name: 'Beer', emoji: '<:Beer:1534994802385485896>', weight: 10 }
];
const CLONE_ROLLS = [
  { rank: 'D', weight: 60 },
  { rank: 'C', weight: 30 },
  { rank: 'B', weight: 8 },
  { rank: 'A', weight: 1.95 },
  { rank: 'S', weight: 0.05 }
];

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
  const args = interactionOrMessage.content.trim().split(/\s+/).slice(2);
  return args[0] || '1';
}

function chooseWeighted(pool) {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const entry of pool) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry;
  }
  return pool[pool.length - 1];
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pluralize(amount, singular, plural = `${singular}s`) {
  return `${amount} ${amount === 1 ? singular : plural}`;
}

function buildChestRewards(amount) {
  const rewards = {
    beli: 0,
    meat: 0,
    wine: 0,
    beer: 0
  };
  const cloneRewards = Object.fromEntries(
    CLONE_RANKS.map(rank => [`clone${rank}`, 0])
  );

  // Roll three item rewards per Chest.
  for (let chest = 0; chest < amount; chest += 1) {
    // Each Chest gets its own Beli roll, so opening many Chests does not use
    // one oversized roll with a different distribution.
    rewards.beli += randomInteger(250, 500);
    for (let roll = 0; roll < 3; roll += 1) {
      rewards[chooseWeighted(CONSUMABLE_ROLLS).field] += 1;
      const clone = chooseWeighted(CLONE_ROLLS);
      cloneRewards[`clone${clone.rank}`] += 1;
    }
  }

  return { ...rewards, ...cloneRewards };
}

function buildRewardLines(rewards) {
  const lines = [
    `<:whitearrow:1532531439445344547> <:SilverCoin:1534757841867374782> Beli **${rewards.beli.toLocaleString('en-US')}**`
  ];
  const itemDetails = [
    ['meat', '<:Ham:1534995152605548585>', 'Meat'],
    ['wine', '<:Wine:1534994973835923706>', 'Wine'],
    ['beer', '<:Beer:1534994802385485896>', 'Beer']
  ];
  for (const [field, emoji, name] of itemDetails) {
    if (rewards[field] > 0) {
      lines.push(
        `<:whitearrow:1532531439445344547> ${emoji} **${rewards[field]}x** ${pluralize(rewards[field], name, name)}`
      );
    }
  }
  for (const rank of CLONE_RANKS) {
    const amount = rewards[`clone${rank}`];
    if (amount > 0) {
      lines.push(
        `<:whitearrow:1532531439445344547> ${rankEmojis[rank]} **${amount}x** ${pluralize(amount, `${rank} Clone`, `${rank} Clones`)}`
      );
    }
  }
  return lines;
}

function buildOpenedEmbed(rewards, amount, user) {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Chest opened')
    .setDescription(buildRewardLines(rewards).join('\n'))
    .setFooter({ text: `${pluralize(amount, 'Chest', 'Chests')} opened by ${user.username}` });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chest')
    .setDescription('Open your Chests')
    .addStringOption(option =>
      option
        .setName('amount')
        .setDescription('How many Chests to open, or all')
        .setRequired(false)
    ),

  name: 'chest',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const requested = String(getRequestedAmount(interactionOrMessage)).trim().toLowerCase();
    const userData = await User.findOne({ userId: user.id });
    const owned = Number(userData?.chests) || 0;

    if (requested === 'all') {
      if (owned < 1) return reply(interactionOrMessage, 'You do not have any Chests');
    } else if (!/^[1-9]\d*$/.test(requested)) {
      return reply(interactionOrMessage, 'Amount must be a positive whole number or `all`');
    }

    const amount = requested === 'all' ? owned : Number(requested);
    if (amount > owned) {
      return reply(
        interactionOrMessage,
        `You only have **${owned}** ${CHEST_EMOJI} Chests`
      );
    }

    const rewards = buildChestRewards(amount);
    const update = {
      $inc: {
        chests: -amount,
        balance: rewards.beli,
        meat: rewards.meat,
        wine: rewards.wine,
        beer: rewards.beer
      }
    };
    for (const rank of CLONE_RANKS) {
      update.$inc[`clone${rank}`] = rewards[`clone${rank}`];
    }

    // Spend the Chests and grant every rolled reward together. If another
    // command opens them first, this update matches zero and nothing is lost.
    const result = await User.collection.updateOne(
      { userId: user.id, chests: { $gte: amount } },
      update
    );
    if (result.matchedCount !== 1) {
      return reply(interactionOrMessage, 'Your Chest count changed, please try again');
    }

    const openingContent =
      `Opening **${amount}x ${CHEST_EMOJI} ` +
      `${amount === 1 ? 'Chest' : 'Chests'} <a:loading:1535021695167889429>**`;
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

    // Leave the opening message visible briefly before replacing it with the
    // result embed so the chest-opening action is clear to the player.
    await new Promise(resolve => setTimeout(resolve, 3000));
    const embed = buildOpenedEmbed(rewards, amount, user);
    if (isSlash(interactionOrMessage)) {
      return interactionOrMessage.editReply({ content: '', embeds: [embed] });
    }
    return response.edit({ content: '', embeds: [embed] });
  }
};