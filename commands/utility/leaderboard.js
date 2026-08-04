// ─────────────────────────────────────────────
// GLOBAL LEADERBOARD
// ─────────────────────────────────────────────
// Displays the top 100 players by total cards, level, or saved team power.
// This uses Components V2 so the controls and leaderboard text share one
// clean card, matching the supplied leaderboard references.

const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const User = require('../../models/user');
const {
  cards,
  resolveStat,
  safeRank,
  safeStat
} = require('../../data/cards');
const { computeBoosts } = require('../../utils/boosts');
const { getLevelProgress } = require('../../utils/levels');
const { updateQuestProgress } = require('../../utils/quests');

const PAGE_SIZE = 10;
const MAX_ENTRIES = 100;
const SESSION_TIME_MS = 300000;

const MODES = {
  cards: {
    label: 'By cards',
    description: 'top 100 ranked by **most to least cards**.'
  },
  level: {
    label: 'By level',
    description: 'top 100 ranked by **highest to lowest level**.'
  },
  team_power: {
    label: 'By team power',
    description: 'top 100 ranked by **highest to lowest team power**.'
  }
};

function getCardCount(userData) {
  return (userData.cardCopies || []).reduce(
    (total, entry) => total + Math.max(0, Number(entry.amount) || 0),
    0
  );
}

function getTeamPower(userData) {
  const ownedByName = new Map(
    (userData.cardCopies || []).map(entry => [entry.cardName, entry])
  );
  const used = new Set();

  return (userData.teamCards || []).reduce((total, cardName) => {
    if (used.has(cardName)) return total;
    used.add(cardName);

    const card = cards.find(item => item.name === cardName);
    const owned = ownedByName.get(cardName);
    if (!card || !owned) return total;

    const rank = safeRank(card.rank);
    const basePower = resolveStat(
      rank,
      'power',
      safeStat(card.power),
      card.name,
      1
    );
    const boosted = computeBoosts(
      resolveStat(rank, 'health', safeStat(card.health), card.name, 1),
      basePower,
      resolveStat(rank, 'speed', safeStat(card.speed), card.name, 1),
      Math.max(1, Number(owned.amount) || 1),
      owned.shiny ?? false
    );

    return total + boosted.power;
  }, 0);
}

function getMetric(userData, mode) {
  if (mode === 'level') return getLevelProgress(userData.xp).level;
  if (mode === 'team_power') return getTeamPower(userData);
  return getCardCount(userData);
}

function sortUsers(users, mode) {
  return [...users]
    .map(userData => ({
      userData,
      metric: getMetric(userData, mode),
      level: getLevelProgress(userData.xp).level,
      cards: getCardCount(userData)
    }))
    .sort((a, b) =>
      b.metric - a.metric ||
      b.level - a.level ||
      b.cards - a.cards ||
      String(a.userData.userId).localeCompare(String(b.userData.userId))
    );
}

async function resolveUserName(client, userId) {
  const cached = client.users.cache.get(userId);
  if (cached) return cached.username;

  try {
    const fetched = await client.users.fetch(userId);
    return fetched.username;
  } catch {
    return 'Unknown user';
  }
}

function formatUserMention(userId, fallbackName) {
  // Discord renders this as a user mention while `allowedMentions.parse: []`
  // below prevents it from sending a notification.
  return /^\d+$/.test(String(userId))
    ? `<@${userId}>`
    : `@${fallbackName}`;
}

function formatMetric(entry, mode) {
  if (mode === 'level') return `Level ${entry.metric}`;
  if (mode === 'team_power') return `${entry.metric.toLocaleString('en-US')} power`;
  return `${entry.metric.toLocaleString('en-US')} cards`;
}

function getRankPrefix(rank) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}.`;
}

function buildComponents(mode, page, totalPages) {
  const previousDisabled = page === 0;
  const nextDisabled = page >= totalPages - 1;

  return [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: `# Global Leaderboard\n${MODES[mode].description}`
        },
        { type: 14, divider: true, spacing: 1 },
        {
          type: 10,
          content: '__LEADERBOARD_LINES__'
        },
        { type: 14, divider: true, spacing: 1 },
        {
          type: 10,
          content: '__YOUR_RANK__'
        },
        // Navigation deliberately comes before the category dropdown.
        {
          type: 1,
          components: [
            {
              type: 2,
              custom_id: 'leaderboard_previous',
              style: 2,
              label: 'Previous',
              disabled: previousDisabled
            },
            {
              type: 2,
              custom_id: 'leaderboard_next',
              style: 2,
              label: 'Next',
              disabled: nextDisabled
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 3,
              custom_id: 'leaderboard_mode',
              placeholder: MODES[mode].label,
              options: Object.entries(MODES).map(([value, details]) => ({
                label: details.label,
                value,
                default: value === mode
              }))
            }
          ]
        }
      ]
    }
  ];
}

function replaceTextComponents(components, leaderboardLines, yourRank) {
  const container = components[0];
  container.components[2].content = leaderboardLines;
  container.components[4].content = yourRank;
  return components;
}

async function buildView(client, allUsers, viewerId, mode, page) {
  const sorted = sortUsers(allUsers, mode);
  const visibleUsers = sorted.slice(0, MAX_ENTRIES);
  const totalPages = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageEntries = visibleUsers.slice(start, start + PAGE_SIZE);

  const names = await Promise.all(
    pageEntries.map(entry => resolveUserName(client, entry.userData.userId))
  );

  const leaderboardLines = pageEntries.length
    ? pageEntries
      .map((entry, index) =>
        `${getRankPrefix(start + index + 1)}  **${formatUserMention(entry.userData.userId, names[index])}**  ·  **${formatMetric(entry, mode)}**`
      )
      .join('\n')
    : 'No players found yet.';

  const viewerIndex = sorted.findIndex(entry => entry.userData.userId === viewerId);
  const viewerEntry = viewerIndex >= 0 ? sorted[viewerIndex] : null;
  const viewerName = await resolveUserName(client, viewerId);
  const yourRank = viewerEntry
    ? `## Your Rank\n**${formatUserMention(viewerId, viewerName)}** is ranked **#${viewerIndex + 1}** with **${formatMetric(viewerEntry, mode)}**.`
    : `## Your Rank\n**${formatUserMention(viewerId, viewerName)}** is not ranked yet.`;

  const components = buildComponents(mode, safePage, totalPages);
  replaceTextComponents(components, leaderboardLines, yourRank);

  return {
    flags: MessageFlags.IsComponentsV2,
    components,
    allowedMentions: { parse: [], repliedUser: false },
    page: safePage,
    totalPages
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the global player leaderboard')
    .addStringOption(option =>
      option
        .setName('by')
        .setDescription('Choose how players should be ranked')
        .setRequired(false)
        .addChoices(
          { name: 'By cards', value: 'cards' },
          { name: 'By level', value: 'level' },
          { name: 'By team power', value: 'team_power' }
        )
    ),

  name: 'leaderboard',
  aliases: ['lb'],

  async execute(interactionOrMessage, args = []) {
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const client = interactionOrMessage.client;
    let mode = isSlash ? interactionOrMessage.options.getString('by') || 'cards' : parsePrefixMode(args);
    let page = 0;

    const viewerData = await User.findOne({ userId: user.id });
    if (viewerData) {
      updateQuestProgress(viewerData, 'leaderboard', 1);
      await viewerData.save();
    }

    const allUsers = await User.find({}).lean();
    let view = await buildView(client, allUsers, user.id, mode, page);

    const payload = {
      flags: MessageFlags.IsComponentsV2,
      components: view.components,
      allowedMentions: { parse: [], repliedUser: false },
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    const collector = response.createMessageComponentCollector({
      time: SESSION_TIME_MS
    });

    collector.on('collect', async componentInteraction => {
      if (componentInteraction.user.id !== user.id) {
        return componentInteraction.reply({
          content: `These aren't yours`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (componentInteraction.customId === 'leaderboard_previous') {
        page = Math.max(0, page - 1);
      } else if (componentInteraction.customId === 'leaderboard_next') {
        page = Math.min(view.totalPages - 1, page + 1);
      } else if (componentInteraction.customId === 'leaderboard_mode') {
        mode = componentInteraction.values[0] || 'cards';
        page = 0;
      }

      const latestUsers = await User.find({}).lean();
      view = await buildView(client, latestUsers, user.id, mode, page);
      await componentInteraction.update({
        flags: MessageFlags.IsComponentsV2,
        components: view.components,
        allowedMentions: { parse: [], repliedUser: false }
      });
    });

    collector.on('end', () => {
      response.edit({
        flags: MessageFlags.IsComponentsV2,
        components: buildExpiredComponents(view.components),
        allowedMentions: { parse: [], repliedUser: false }
      }).catch(() => {});
    });
  }
};

function buildExpiredComponents(components) {
  const expired = JSON.parse(JSON.stringify(components));
  const container = expired[0];
  const navigation = container.components[5];
  const dropdown = container.components[6];

  for (const button of navigation.components) button.disabled = true;
  dropdown.components[0].disabled = true;
  return expired;
}

function parsePrefixMode(args) {
  const requested = args.join(' ').toLowerCase().trim();
  if (requested === 'level') return 'level';
  if (
    requested === 'team' ||
    requested === 'power' ||
    requested === 'team power' ||
    requested === 'team_power'
  ) {
    return 'team_power';
  }
  return 'cards';
}