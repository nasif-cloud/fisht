const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const mongoose = require('mongoose');

const ChannelDrop = require('../models/channelDrop');
const CardDrop = require('../models/cardDrop');
const User = require('../models/user');
const {
  cards,
  rankConfig,
  rankEmojis,
  resolveStat,
  safeRank,
  safeStat
} = require('../data/cards');
const {
  getCardImagePayload,
  getNormalizedBuffer
} = require('./cardImage');
const { generateShinyImage, generateShinyIcon } = require('./shinyImage');
const { computeBoosts } = require('./boosts');

const DROP_CLAIM_LIFETIME_MS = 60 * 1000;
const DROP_CHARGE_WINDOW_MS = 60 * 1000;
const DROP_CHECK_INTERVAL_MS = 15 * 1000;
const MINIMUM_MESSAGES_FOR_SCHEDULED_DROP = 3;
const DESERT_ACTIVITY_WINDOW_MS = 6 * 60 * 60 * 1000;
const DROP_COOLDOWN_MS = 60 * 1000;
const SHINY_DROP_CHANCE = 0.8;
const SHINY_EMOJI = '<:holo:1533666993637687466>';
const CHARGE_EMOJI = '<:charge:1534734619516076140>';

// Charge 0 is intentionally the slowest schedule. A channel with almost no
// conversation is also blocked by the desert checks below, so it can go
// indefinitely without filling the channel with unwanted drops.
const CHARGE_INTERVALS_MS = {
  0: 3 * 60 * 60 * 1000,
  1: 2 * 60 * 60 * 1000,
  2: 60 * 60 * 1000,
  3: 60 * 60 * 1000,
  4: 20 * 60 * 1000,
  5: 20 * 60 * 1000
};

const RANK_WEIGHTS_BY_CHARGE = {
  0: { D: 100 },
  1: { D: 80, C: 20 },
  2: { D: 50, C: 40, B: 10 },
  3: { D: 10, C: 50, B: 30, A: 10 },
  4: { C: 20, B: 50, A: 25, S: 5 },
  5: { B: 50, A: 30, S: 18, SS: 2 }
};

let schedulerTimer = null;
const channelLocks = new Set();

function getCharge(config) {
  // Every 25 human messages add one charge, and every three distinct
  // chatters add one more. The value intentionally remains above 5 so the
  // extra-charge SS-to-UR transfer can affect very active channels.
  const messageCharge = Math.floor((config.messagesSinceDrop || 0) / 25);
  const peopleCharge = Math.floor((config.activeUserIds || []).length / 3);
  return messageCharge + peopleCharge;
}

function getScheduleIntervalMs(charge) {
  return CHARGE_INTERVALS_MS[Math.min(5, charge)] || CHARGE_INTERVALS_MS[5];
}

function getRankWeights(charge) {
  const base = { ...(RANK_WEIGHTS_BY_CHARGE[Math.min(5, charge)] || RANK_WEIGHTS_BY_CHARGE[5]) };
  const extraCharge = Math.max(0, charge - 5);
  const transfer = Math.min(base.SS || 0, extraCharge * 0.1);

  if (transfer > 0) {
    base.SS = (base.SS || 0) - transfer;
    base.UR = (base.UR || 0) + transfer;
  }

  return base;
}

function rollWeightedRank(charge, availableRanks = null) {
  const allWeights = getRankWeights(charge);
  const entries = Object.entries(allWeights).filter(([rank, weight]) =>
    weight > 0 &&
    (!availableRanks ||
      (typeof availableRanks.has === 'function'
        ? availableRanks.has(rank)
        : availableRanks.includes(rank)))
  );

  // The normal path has every rank in the catalog. If an incomplete catalog
  // is ever deployed, renormalize over ranks that actually have cards.
  const usable = entries.length ? entries : Object.entries(allWeights).filter(([, weight]) => weight > 0);
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = Math.random() * total;
  let cumulative = 0;

  for (const [rank, weight] of usable) {
    cumulative += weight;
    if (roll < cumulative) return rank;
  }

  return usable[usable.length - 1]?.[0] || 'D';
}

function getM1CardsByRank() {
  const byRank = {};
  for (const card of cards) {
    if (!card.name || !card.image) continue;
    const rank = safeRank(card.rank);
    if (!byRank[rank]) byRank[rank] = [];
    byRank[rank].push(card);
  }
  return byRank;
}

function pickDropCard(charge) {
  const cardsByRank = getM1CardsByRank();
  const availableRanks = new Set(Object.keys(cardsByRank));
  const rank = rollWeightedRank(charge, availableRanks);
  const pool = cardsByRank[rank] || cardsByRank.D || Object.values(cardsByRank)[0] || [];
  const card = pool[Math.floor(Math.random() * pool.length)];

  if (!card) throw new Error('No M1 cards are available for a channel drop');

  return { card, rank: safeRank(card.rank) };
}

function getDropStats(card, rank) {
  return {
    health: resolveStat(rank, 'health', safeStat(card.health), card.name, 1),
    power: resolveStat(rank, 'power', safeStat(card.power), card.name, 1),
    speed: resolveStat(rank, 'speed', safeStat(card.speed), card.name, 1)
  };
}

function createClaimRow(dropId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`card_drop_claim:${dropId}`)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success)
  );
}

function createChargeRow(dropId, chargeCount = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`card_drop_charge:${dropId}`)
      .setLabel('charge')
      .setEmoji(CHARGE_EMOJI)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`card_drop_charge_count:${dropId}`)
      .setLabel(String(chargeCount))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function buildChargePayload(drop) {
  const embed = new EmbedBuilder()
    .setTitle('A drop is ready')
    .setDescription(
      'Click this button to charge up the drop. More charges = better card.\n' +
      '-# sends in 1 minute'
    )
    .setColor(0x2b2d31);

  return {
    embeds: [embed],
    components: [createChargeRow(drop._id.toString(), drop.chargeCount || 0)]
  };
}

async function buildDropPayload(drop, card, rank, stats, { claimable = true } = {}) {
  const visual = rankConfig[rank]?.M1 || rankConfig.D.M1;
  const title = drop.isShiny ? `${SHINY_EMOJI} ${card.name}` : card.name;
  const files = [];
  let imageUrl = card.image;
  let iconUrl = visual.icon;

  if (drop.isShiny) {
    const [cardBuffer, iconBuffer] = await Promise.all([
      generateShinyImage(card.image, card.name),
      generateShinyIcon(visual.icon)
    ]);
    const normalizedCard = await getNormalizedBuffer(
      cardBuffer,
      `drop-shiny:${card.image}`
    );
    files.push(
      new AttachmentBuilder(normalizedCard, { name: 'drop_card.jpg' }),
      new AttachmentBuilder(iconBuffer, { name: 'drop_icon.png' })
    );
    imageUrl = 'attachment://drop_card.jpg';
    iconUrl = 'attachment://drop_icon.png';
  } else {
    const imagePayload = await getCardImagePayload(card.image, 'drop_card.jpg');
    imageUrl = imagePayload.imageUrl;
    for (const file of imagePayload.files) {
      files.push(new AttachmentBuilder(file.attachment, { name: file.name }));
    }
  }

  const displayedStats = computeBoosts(
    stats.health,
    stats.power,
    stats.speed,
    1,
    drop.isShiny
  );

  const embed = new EmbedBuilder()
    .setColor(visual.color)
    .setTitle(claimable ? 'A card has dropped!' : 'A card drop is incoming!')
    .setDescription(
      `${title}\n\n` +
      (drop.title ? `${drop.title}\n\n` : '') + 
      (claimable
        ? `**Health:** ${displayedStats.health}\n` +
          `**Power:** ${displayedStats.power}\n` +
          `**Speed:** ${displayedStats.speed}\n\n` +
          'First person to press **Claim** receives this M1 card'
        : 'The claim button will appear here in 1 minute')
    )
    .setThumbnail(iconUrl)
    .setImage(imageUrl)
    .setFooter({
      text: claimable
        ? 'Card drops are M1 only • Claim window: 1 minute'
        : 'Card drops are M1 only • Claim unlocks in 1 minute'
    });

  return {
    embeds: [embed],
    files,
    components: claimable ? [createClaimRow(drop._id.toString())] : []
  };
}

async function clearPendingDrop(config, drop) {
  if (!drop) return;
  await ChannelDrop.updateOne(
    { _id: config._id, pendingDropId: drop._id },
    { $set: { pendingDropId: null } }
  );
}

async function getPendingDrop(config) {
  if (!config.pendingDropId) return null;
  const drop = await CardDrop.findById(config.pendingDropId);
  if (!drop) {
    await ChannelDrop.updateOne(
      { _id: config._id, pendingDropId: config.pendingDropId },
      { $set: { pendingDropId: null } }
    );
    return null;
  }

  const now = new Date();
  // Keep charging records visible to the scheduler even after chargeEndsAt.
  // The scheduler needs to see the record in order to atomically roll the
  // collected charge count into the final card.
  const isCharging = drop.status === 'charging';
  const isLegacyTeaser = drop.status === 'teaser' && drop.expiresAt > now;
  const isClaimable = drop.status === 'pending' && drop.expiresAt > now;

  if (isCharging || isLegacyTeaser || isClaimable) {
    return drop;
  }

  if (['charging', 'teaser', 'pending'].includes(drop.status)) {
    await CardDrop.updateOne(
      { _id: drop._id, status: { $in: ['charging', 'teaser', 'pending'] } },
      { $set: { status: 'expired' } }
    );
  }
  await clearPendingDrop(config, drop);
  return null;
}

async function sendDropToChannel(channel, options = {}) {
  if (!channel?.guildId || !channel.id) throw new Error('A guild text channel is required');
  if (channelLocks.has(channel.id)) return null;
  channelLocks.add(channel.id);

  try {
    const config = await ChannelDrop.findOne({
      guildId: channel.guildId,
      channelId: channel.id,
      enabled: true
    });
    if (!config) return null;

    const pending = await getPendingDrop(config);
    if (pending && !options.force) return null;
    if (pending && options.force) {
      await CardDrop.updateOne(
        { _id: pending._id, status: { $in: ['charging', 'teaser', 'pending'] } },
        { $set: { status: 'expired' } }
      );
      await ChannelDrop.updateOne(
        { _id: config._id, pendingDropId: pending._id },
        { $set: { pendingDropId: null } }
      );
    }

    const now = new Date();
    const drop = await CardDrop.create({
      guildId: channel.guildId,
      channelId: channel.id,
      chargeEndsAt: new Date(now.getTime() + DROP_CHARGE_WINDOW_MS),
      chargeCount: 0,
      chargeUserIds: []
    });

    // Reserve the channel before doing image work or sending. The conditional
    // update is the cross-process lock that prevents two bot instances from
    // producing two claimable drops at the same time.
    const reserved = await ChannelDrop.findOneAndUpdate(
      {
        _id: config._id,
        enabled: true,
        pendingDropId: null
      },
      { $set: { pendingDropId: drop._id } },
      { new: true }
    );
    if (!reserved) {
      await CardDrop.updateOne(
        { _id: drop._id, status: 'charging' },
        { $set: { status: 'expired' } }
      );
      return null;
    }

    try {
      const payload = buildChargePayload(drop);
      const sent = await channel.send(payload);
      drop.teaserMessageId = sent.id;
      await drop.save();

      await ChannelDrop.updateOne(
        { _id: config._id },
        {
          $set: {
            lastDropAt: now,
            lastMessageAt: null,
            messagesSinceDrop: 0,
            activeUserIds: [],
            pendingDropId: drop._id
          }
        }
      );
      return sent;
    } catch (error) {
      await CardDrop.updateOne(
        { _id: drop._id, status: { $in: ['charging', 'teaser', 'pending'] } },
        { $set: { status: 'expired' } }
      );
      await ChannelDrop.updateOne(
        { _id: config._id, pendingDropId: drop._id },
        { $set: { pendingDropId: null } }
      );
      throw error;
    }
  } finally {
    channelLocks.delete(channel.id);
  }
}

async function activateDrop(channel, drop) {
  if (!drop || drop.status !== 'charging' || drop.chargeEndsAt > new Date()) return null;
  const activationNow = new Date();
  const charge = Math.max(0, Number(drop.chargeCount) || 0);
  const { card, rank } = pickDropCard(charge);
  const isShiny = Math.random() < SHINY_DROP_CHANCE;
  const stats = getDropStats(card, rank);
  const claimedActivation = await CardDrop.findOneAndUpdate(
    {
      _id: drop._id,
      status: 'charging',
      chargeEndsAt: { $lte: activationNow }
    },
    {
      // Start the full claim window when the claimable message is actually
      // activated, not when the teaser was sent.
      $set: {
        status: 'pending',
        cardName: card.name,
        rank,
        isShiny,
        imageUrl: card.image,
        title: card.title || '',
        ...stats,
        claimAt: activationNow,
        expiresAt: new Date(activationNow.getTime() + DROP_CLAIM_LIFETIME_MS)
      }
    },
    { new: true }
  );
  if (!claimedActivation) return null;

  return publishClaimableDrop(channel, claimedActivation, card);
}

// Publishes the claimable state after the teaser. If the process restarted
// after the database transition, the scheduler calls this with the same
// persisted record and safely reconstructs the claim message.
async function publishClaimableDrop(channel, drop, card = null) {
  const resolvedCard = card || cards.find(candidate => candidate.name === drop.cardName);
  if (!resolvedCard) throw new Error(`Drop card data is missing for ${drop.cardName}`);

  try {
    const payload = await buildDropPayload(
      drop,
      resolvedCard,
      drop.rank,
      {
        health: drop.health,
        power: drop.power,
        speed: drop.speed
      },
      { claimable: true }
    );
    let sent = null;

    // Prefer editing the teaser so a restart does not create a duplicate
    // visible drop. The fallback send handles deleted teasers or channels
    // where message history is unavailable.
    if (drop.teaserMessageId && channel.messages?.fetch) {
      const teaser = await channel.messages.fetch(drop.teaserMessageId).catch(() => null);
      if (teaser) {
        sent = await teaser.edit({ ...payload, attachments: [] });
      }
    }
    if (!sent) sent = await channel.send(payload);

    await CardDrop.updateOne(
      { _id: drop._id, status: 'pending' },
      { $set: { messageId: sent.id } }
    );
    return sent;
  } catch (error) {
    await CardDrop.updateOne(
      { _id: drop._id, status: 'pending' },
      { $set: { status: 'expired' } }
    );
    await ChannelDrop.updateOne(
      {
        guildId: drop.guildId,
        channelId: drop.channelId,
        pendingDropId: drop._id
      },
      { $set: { pendingDropId: null } }
    );
    throw error;
  }
}

async function configureDropChannel(channel, userId) {
  const existing = await ChannelDrop.findOne({
    guildId: channel.guildId,
    channelId: channel.id
  });
  if (existing?.pendingDropId) {
    await CardDrop.updateOne(
      { _id: existing.pendingDropId, status: { $in: ['charging', 'teaser', 'pending'] } },
      { $set: { status: 'expired' } }
    );
  }

  await ChannelDrop.findOneAndUpdate(
    { guildId: channel.guildId, channelId: channel.id },
    {
      $set: {
        enabled: true,
        enabledBy: userId,
        enabledAt: new Date(),
        lastDropAt: null,
        lastMessageAt: null,
        messagesSinceDrop: 0,
        activeUserIds: [],
        pendingDropId: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return sendDropToChannel(channel, { force: true });
}

async function disableDropChannel(guildId, channelId) {
  const config = await ChannelDrop.findOneAndUpdate(
    { guildId, channelId },
    { $set: { enabled: false } },
    { new: true }
  );
  if (config?.pendingDropId) {
    await CardDrop.updateOne(
      { _id: config.pendingDropId, status: { $in: ['charging', 'teaser', 'pending'] } },
      { $set: { status: 'expired' } }
    );
    await ChannelDrop.updateOne(
      { _id: config._id, pendingDropId: config.pendingDropId },
      { $set: { pendingDropId: null } }
    );
  }
  return Boolean(config);
}

async function recordChannelActivity(message) {
  if (!message.guild || message.author.bot) return;
  try {
    await ChannelDrop.updateOne(
      { guildId: message.guild.id, channelId: message.channel.id, enabled: true },
      {
        $inc: { messagesSinceDrop: 1 },
        $addToSet: { activeUserIds: message.author.id },
        $set: { lastMessageAt: new Date() }
      }
    );
  } catch (error) {
    console.error('[CardDrops] Activity update failed:', error.message);
  }
}

async function evaluateChannel(config, client) {
  const now = new Date();
  const pending = await getPendingDrop(config);
  if (pending?.status === 'charging') {
    if (pending.chargeEndsAt > now) return;
    const channel = await client.channels.fetch(config.channelId).catch(() => null);
    if (channel?.isTextBased?.()) await activateDrop(channel, pending);
    return;
  }
  if (pending?.status === 'teaser') {
    // Legacy records from the pre-charge implementation are allowed to
    // expire naturally rather than being mistaken for chargeable drops.
    return;
  }
  if (pending?.status === 'pending' && !pending.messageId) {
      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (channel?.isTextBased?.()) await publishClaimableDrop(channel, pending);
      return;
  }
  if (pending) return;
  if (!config.lastDropAt || !config.lastMessageAt) return;
  if ((config.messagesSinceDrop || 0) < MINIMUM_MESSAGES_FOR_SCHEDULED_DROP) return;
  if (now - config.lastMessageAt > DESERT_ACTIVITY_WINDOW_MS) return;

  const charge = getCharge(config);
  const interval = Math.max(DROP_COOLDOWN_MS, getScheduleIntervalMs(charge));
  if (now - config.lastDropAt < interval) return;

  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await sendDropToChannel(channel);
}

async function runScheduler(client) {
  try {
    const configs = await ChannelDrop.find({ enabled: true }).lean();
    for (const config of configs) {
      try {
        await evaluateChannel(config, client);
      } catch (error) {
        console.error(`[CardDrops] Failed to evaluate ${config.channelId}:`, error.message);
      }
    }
  } catch (error) {
    console.error('[CardDrops] Scheduler failed:', error.message);
  }
}

function startCardDropScheduler(client) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    void runScheduler(client);
  }, DROP_CHECK_INTERVAL_MS);
  schedulerTimer.unref?.();
  void runScheduler(client);
  console.log('[CardDrops] Scheduler started');
}

async function handleDropInteraction(interaction) {
  if (!interaction.isButton?.()) return false;
  const isClaim = interaction.customId.startsWith('card_drop_claim:');
  const isCharge = interaction.customId.startsWith('card_drop_charge:');
  if (!isClaim && !isCharge) return false;

  const prefix = isCharge ? 'card_drop_charge:' : 'card_drop_claim:';
  const dropId = interaction.customId.slice(prefix.length);
  if (!mongoose.isValidObjectId(dropId)) {
    await interaction.reply({ content: 'This card drop is invalid.', flags: 64 });
    return true;
  }

  // Acknowledge the button immediately. The database transaction below can
  // involve a new user document and must not consume Discord's short
  // interaction acknowledgement window.
  await interaction.deferUpdate();

  if (isCharge) {
    const chargedDrop = await CardDrop.findOneAndUpdate(
      {
        _id: dropId,
        status: 'charging',
        chargeEndsAt: { $gt: new Date() },
        chargeUserIds: { $ne: interaction.user.id }
      },
      {
        $addToSet: { chargeUserIds: interaction.user.id },
        $inc: { chargeCount: 1 }
      },
      { new: true }
    );

    if (!chargedDrop) {
      await interaction.followUp({
        content: 'You already charged this drop, or charging has ended.',
        flags: 64
      });
      return true;
    }

    try {
      await interaction.editReply(buildChargePayload(chargedDrop));
    } catch (error) {
      console.warn('[CardDrops] Could not update charge count:', error.message);
    }
    return true;
  }

  let claimedDrop = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      claimedDrop = await CardDrop.findOneAndUpdate(
        {
          _id: dropId,
          status: 'pending',
          expiresAt: { $gt: new Date() }
        },
        {
          $set: {
            status: 'claimed',
            claimedBy: interaction.user.id,
            claimedAt: new Date()
          }
        },
        { new: true, session }
      );
      if (!claimedDrop) return;

      let userData = await User.findOne({ userId: interaction.user.id }).session(session);
      if (!userData) userData = new User({ userId: interaction.user.id });

      const existing = userData.cardCopies.find(copy => copy.cardName === claimedDrop.cardName);
      if (existing) {
        existing.amount = Math.max(0, Number(existing.amount) || 0) + 1;
        existing.lastObtained = new Date();
        if (claimedDrop.isShiny) existing.shiny = true;
      } else {
        userData.cardCopies.push({
          cardName: claimedDrop.cardName,
          amount: 1,
          lastObtained: new Date(),
          shiny: claimedDrop.isShiny
        });
      }
      await userData.save({ session });

      await ChannelDrop.updateOne(
        { guildId: claimedDrop.guildId, channelId: claimedDrop.channelId, pendingDropId: claimedDrop._id },
        { $set: { pendingDropId: null } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  if (!claimedDrop) {
    await interaction.followUp({
      content: 'This card has already been claimed or expired.',
      flags: 64
    });
    return true;
  }

  try {
    await interaction.editReply({ components: [] });
  } catch (error) {
    console.warn('[CardDrops] Could not remove claim button:', error.message);
  }

  await interaction.channel.send({
    content: `**${interaction.user.username}** claimed **${rankEmojis[claimedDrop.rank] || claimedDrop.rank} ${claimedDrop.cardName}** card first`
  });
  return true;
}

module.exports = {
  DROP_CLAIM_LIFETIME_MS,
  DROP_CHARGE_WINDOW_MS,
  CHARGE_INTERVALS_MS,
  RANK_WEIGHTS_BY_CHARGE,
  getCharge,
  getScheduleIntervalMs,
  getRankWeights,
  rollWeightedRank,
  configureDropChannel,
  disableDropChannel,
  recordChannelActivity,
  startCardDropScheduler,
  handleDropInteraction
};