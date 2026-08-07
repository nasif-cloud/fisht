// ─────────────────────────────────────────────
// RAID — raid key shop (Components V2)
// ─────────────────────────────────────────────
// Opens a paginated "Raid Shop" built with the newer Discord components V2
// (a Container holding Text Displays, a Media Gallery, a Separator and a
// Section of buttons) — the layout requested in the spec.
//
// V2 components REQUIRE the message flag `IsComponentsV2` (1 << 15 = 32768).
// Without it Discord treats the payload as legacy components and rejects any
// type-17 container. We always send that flag on this message.
//
// Each page shows one raid boss. The boss stats shown are the *tripled* stats
// of the card the raid is based on at that mastery. Players exchange Silver /
// Iron keys (dug out of Chests) for a Golden key that unlocks the raid. You
// must own the card the raid is based on.
//
// Slash: /raid
// Prefix: op raid   (aliases: raids)
//
// Because V2 messages cannot use embeds, the "expired" README rule is applied
// by disabling every control when the shop session expires.

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const User = require('../../models/user');
const RAID_BOSSES = require('../../data/raids');
const { cards, safeStat, safeRank, resolveStat, rankEmojis } = require('../../data/cards');
const { INVENTORY_ITEMS } = require('../../data/inventoryItems');
const { isLeaderNow } = require('../../utils/leadership');
const { claimInteractionLock } = require('../../utils/interactionLock');

// Rank order used for the filter dropdown (UR is strongest, D is weakest).
const RANKS = ['UR', 'SS', 'S', 'A', 'B', 'C', 'D'];

// How many Silver OR Iron keys a Golden key costs, per raid rank.
// A player pays with EITHER silver keys OR iron keys — never both at once.
const KEY_COSTS = {
  UR: { silver: 10, iron: 3 },
  SS: { silver: 5, iron: 2 },
  S:  { silver: 3, iron: 1 },
  A:  { silver: 2, iron: 1 },
  B:  { silver: 1, iron: 1 },
  C:  { silver: 1, iron: 1 },
  D:  { silver: 1, iron: 1 }
};

const GOLD_KEY_EMOJI = INVENTORY_ITEMS.goldKey.emoji;
const SILVER_KEY_EMOJI = INVENTORY_ITEMS.silverKey.emoji;
const IRON_KEY_EMOJI = INVENTORY_ITEMS.ironKey.emoji;

const FILTER_ID = 'raid_filter';
const PREV_ID = 'raid_prev';
const NEXT_ID = 'raid_next';
const ALL_FILTER = 'ALL';
const SHOP_TIMEOUT_MS = 300000;

// The flag that marks this message as a components-V2 message.

// ── Helpers relating a raid boss to its card ────────────────────────────────

// The raid uses a specific mastery tier (1/2/3) of its card.
function getRaidCardData(boss) {
  const card = cards.find(c => c.name === boss.cardName);
  if (!card) return null;
  const tier = boss.mastery === 3 ? (card.M3 || card)
    : boss.mastery === 2 ? (card.M2 || card)
    : card;
  return { card, tier };
}

// The effective rank of the raid is the rank of its card at that mastery.
function getRaidRank(boss) {
  const data = getRaidCardData(boss);
  if (!data) return 'D';
  return safeRank(data.tier.rank || data.card.rank);
}

// The boss stats = the card's stats at that mastery, tripled (seeded RNG).
function getRaidStats(boss) {
  const data = getRaidCardData(boss);
  if (!data) return { hp: 0, atk: 0, spd: 0 };
  const { card, tier } = data;
  const rank = safeRank(tier.rank || card.rank);
  const hp = resolveStat(rank, 'health', safeStat(tier.health), card.name, boss.mastery) * 3;
  const atk = resolveStat(rank, 'power', safeStat(tier.power), card.name, boss.mastery) * 3;
  const spd = resolveStat(rank, 'speed', safeStat(tier.speed), card.name, boss.mastery) * 3;
  return { hp, atk, spd };
}

function getRaidCost(boss) {
  return KEY_COSTS[getRaidRank(boss)] || KEY_COSTS.D;
}

// Does this player currently qualify to exchange for this raid's Golden key?
function ownsRaidCard(userData, boss) {
  return (userData?.cardCopies || [])
    .some(e => e.cardName === boss.cardName && Number(e.amount) > 0);
}

function ownsGoldKey(userData, boss) {
  return (userData?.goldKeys || []).some(g => g.raidId === boss.id);
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// The Silver / Iron cost line (Iron cost first, then the Silver cost).
function formatCost(boss) {
  const cost = getRaidCost(boss);
  return `Cost: ${cost.iron}x ${IRON_KEY_EMOJI} ${cost.iron === 1 ? 'Iron Key' : 'Iron Keys'} or ` +
    `${cost.silver}x ${SILVER_KEY_EMOJI} ${cost.silver === 1 ? 'Silver Key' : 'Silver Keys'}`;
}

const V2_FLAGS = MessageFlags.IsComponentsV2;

// ── Components V2 builders ──────────────────────────────────────────────────

// The rank filter dropdown — a String Select (type 3) wrapped in an Action Row
// (type 1), because inside a Container select menus must live in an action row.
// Options cover "All" plus every rank from UR down to D.
function buildFilterSelect(currentFilter, disabled = false) {
  // Use the rank's own emoji from data/cards.js (rankEmojis). Each emoji is a
  // Discord string like "<:UR1:1532557985312931921>", which we parse into the
  // { name, id } object a select option needs so every rank shows its own icon.
  const rankOptions = RANKS.map(rank => {
    const match = (rankEmojis[rank] || '').match(/<:([^:]+):(\d+)>/);
    const option = { label: rank, value: rank, default: currentFilter === rank };
    if (match) option.emoji = { name: match[1], id: match[2] };
    return option;
  });

  return {
    type: 1,
    components: [{
      type: 3,
      custom_id: FILTER_ID,
      placeholder: 'Filter raids by rank',
      disabled,
      options: [
        { label: 'All', value: ALL_FILTER, default: currentFilter === ALL_FILTER },
        ...rankOptions
      ]
    }]
  };
}

// One raid's full shop page — a single Container (type 17) matching the
// requested V2 layout: header, media gallery (art + stats), a separator, the
// cost line, and a Section (type 1) holding the buttons.
function buildRaidContainer(currentFilter, boss, index, total, userId, disabled = false) {
  const rank = getRaidRank(boss);
  const stats = getRaidStats(boss);
  const description = `HP ${formatNumber(stats.hp)}/${formatNumber(stats.hp)} | ` +
    `ATK ${formatNumber(stats.atk)} | SPD ${formatNumber(stats.spd)}`;

  return {
    type: 17,
    components: [
      buildFilterSelect(currentFilter, disabled),
      {
        type: 10,
        content: `# Raid Shop\n${boss.title}\n-# (${rankEmojis[rank]} ${rank}) ${boss.cardName}`
      },
      {
        type: 12,
        items: [{ media: { url: boss.image }, description }]
      },
      { type: 14, spacing: 1, divider: true },
      { type: 10, content: formatCost(boss) },
      {
        type: 1,
        components: [
          { type: 2, style: 2, label: 'Exchange', custom_id: `raid_exchange:${boss.id}:${userId}`, disabled },
          { type: 2, style: 2, label: 'Previous', custom_id: PREV_ID, disabled: disabled || index === 0 },
          { type: 2, style: 2, label: 'Next', custom_id: NEXT_ID, disabled: disabled || index >= total - 1 }
        ]
      }
    ]
  };
}

// Empty page when the active filter has no raids at all.
function buildEmptyContainer(currentFilter, message) {
  return {
    type: 17,
    components: [
      buildFilterSelect(currentFilter),
      { type: 10, content: `# Raid Shop\n${message}` }
    ]
  };
}

// The complete message payload for the current filter + page index. Always
// includes the V2 flag so Discord accepts the type-17 container.
function buildPayload(state, userId, disabled = false) {
  const filtered = RAID_BOSSES.filter(boss =>
    state.filter === ALL_FILTER ? true : getRaidRank(boss) === state.filter
  );

  if (filtered.length === 0) {
    const label = state.filter === ALL_FILTER ? 'raids' : `${state.filter} raids`;
    return {
      flags: V2_FLAGS,
      components: [buildEmptyContainer(state.filter, `No ${label} available yet`)]
    };
  }

  const index = Math.min(state.index, filtered.length - 1);
  const boss = filtered[index];
  return {
    flags: V2_FLAGS,
    components: [buildRaidContainer(state.filter, boss, index, filtered.length, userId, disabled)]
  };
}

// Recursively disable every button (type 2) + select menu (type 3) so the shop
// can be locked once the session expires.
function markDisabled(component) {
  if (component.type === 2 || component.type === 3) return { ...component, disabled: true };
  if (component.components) return { ...component, components: component.components.map(markDisabled) };
  return component;
}

function disablePayload(payload) {
  return { ...payload, components: payload.components.map(markDisabled) };
}


// Perform the key exchange atomically (spends Silver, falls back to Iron only
// when the player lacks enough Silver). Returns { ok, reason | payment }.
async function performExchange(userId, boss) {
  const cost = getRaidCost(boss);
  const userData = await User.findOne({ userId });
  if (!userData) return { ok: false, reason: 'Your account was not found' };

  if (!ownsRaidCard(userData, boss)) {
    return { ok: false, reason: `You must own **${boss.cardName}** to buy this raid key` };
  }
  if (ownsGoldKey(userData, boss)) {
    return { ok: false, reason: 'You already own this raid key' };
  }

  const silver = Number(userData.silverKeys) || 0;
  const iron = Number(userData.ironKeys) || 0;
  let payment;
  if (silver >= cost.silver) {
    payment = { field: 'silverKeys', amount: cost.silver };
  } else if (iron >= cost.iron) {
    payment = { field: 'ironKeys', amount: cost.iron };
  } else {
    return {
      ok: false,
      reason: `You need **${cost.silver}** Silver Keys or **${cost.iron}** Iron Keys for this raid`
    };
  }

  // Atomic update: spend the chosen keys AND add the Golden key in one step.
  const result = await User.collection.updateOne(
    {
      userId,
      [payment.field]: { $gte: payment.amount },
      'goldKeys.raidId': { $ne: boss.id }
    },
    {
      $inc: { [payment.field]: -payment.amount },
      $push: { goldKeys: { raidId: boss.id } }
    }
  );

  if (result.matchedCount !== 1) {
    return { ok: false, reason: 'Something changed, please try again' };
  }
  return { ok: true, payment };
}


module.exports = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Browse and buy raid keys'),

  name: 'raid',
  aliases: ['raids'],

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const state = { filter: ALL_FILTER, index: 0 };

    // A serialized promise queue ensures button/select clicks are processed one
    // at a time, so rapid clicks never overlap an in-flight edit. Crucially, we
    // acknowledge each interaction with deferUpdate() IMMEDIATELY on collect —
    // Discord requires an ack within ~3 seconds, and heavy work (DB etc.) queued
    // behind an earlier click would otherwise make later clicks time out with
    // "Unknown interaction" / "already acknowledged" errors.
    let queue = Promise.resolve();

    const payload = buildPayload(state, user.id);
    const response = isSlash
      ? await interactionOrMessage.reply({ ...payload, fetchReply: true })
      : await interactionOrMessage.channel.send(payload);

    const collector = response.createMessageComponentCollector({ time: SHOP_TIMEOUT_MS });

    collector.on('collect', async interaction => {
      // Only the newest/main deploy may handle clicks. A stale instance returns
      // immediately (without acknowledging) so the leader instance is the only
      // one that responds — this prevents "already acknowledged" from two bots.
      if (!isLeaderNow()) return;
      if (!(await claimInteractionLock(interaction.id))) return;

      // Acknowledge right away so the interaction never expires while queued.
      try {
        await interaction.deferUpdate();
      } catch (ackErr) {
        // The interaction already timed out on Discord's side — nothing to do.
        return;
      }

      // Now queue the actual work; update the message whenever it runs.
      queue = queue.then(() => handleInteraction(interaction)).catch(err => {
        console.error('[Raid] Button interaction failed:', err?.message || err);
      });
    });

    async function handleInteraction(interaction) {
      // We already deferUpdate()'d, so errors are sent as ephemeral followUps
      // and successful state changes edit the message in place.
      if (interaction.user.id !== user.id) {
        return interaction.followUp({
          content: "These aren't yours",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [], repliedUser: false }
        });
      }
      collector.resetTimer();
      const id = interaction.customId;

      // Change the rank filter (dropdown).
      if (id === FILTER_ID) {
        state.filter = interaction.values?.[0] || ALL_FILTER;
        state.index = 0;
        return interaction.editReply(buildPayload(state, user.id));
      }

      // Page backwards.
      if (id === PREV_ID) {
        state.index = Math.max(0, state.index - 1);
        return interaction.editReply(buildPayload(state, user.id));
      }

      // Page forwards.
      if (id === NEXT_ID) {
        const filtered = RAID_BOSSES.filter(boss =>
          state.filter === ALL_FILTER ? true : getRaidRank(boss) === state.filter
        );
        state.index = Math.min(filtered.length - 1, state.index + 1);
        return interaction.editReply(buildPayload(state, user.id));
      }

      // Exchange Silver / Iron keys for this raid's Golden key.
      if (id.startsWith('raid_exchange:')) {
        const raidId = id.split(':')[1];
        const boss = RAID_BOSSES.find(b => b.id === raidId);
        if (!boss) {
          return interaction.followUp({
            content: 'That raid no longer exists',
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [], repliedUser: false }
          });
        }

        const result = await performExchange(user.id, boss);
        if (!result.ok) {
          return interaction.followUp({
            content: result.reason,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [], repliedUser: false }
          });
        }

        // Confirm the purchase in the channel, replying to the shop message,
        // then refresh the shop so the bought key is reflected on the page.
        const keyName = `${boss.cardName} M${boss.mastery} Gold Key`;
        await response.reply({
          content: `Baught ${GOLD_KEY_EMOJI} ${keyName}`,
          allowedMentions: { parse: [], repliedUser: false }
        });
        return interaction.editReply(buildPayload(state, user.id)).catch(() => {});
      }
    }

    // Lock the shop once it expires — every control gets disabled (README's
    // "expired" rule applied to this V2 message since embeds aren't allowed).
    collector.on('end', () => {
      response.edit(disablePayload(buildPayload(state, user.id))).catch(() => {});
    });
  }
};

