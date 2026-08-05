const { SlashCommandBuilder } = require('discord.js');

// The User model so we can check when the player's personal timers were used.
const User = require('../../models/user');

// ─────────────────────────────────────────────
// RESET TIME HELPERS
// ─────────────────────────────────────────────
// All reset times use Eastern Time (America/New_York), which automatically
// handles daylight-saving changes.

function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const match = str.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  return {
    year: parseInt(match[3]),
    month: parseInt(match[1]),
    day: parseInt(match[2]),
    hour: parseInt(match[4]) % 24,
    minute: parseInt(match[5]),
    second: parseInt(match[6])
  };
}

function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetH of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetH, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

function getResetCandidates(now, resetTimesET) {
  const candidates = [];
  for (let d = -1; d <= 1; d++) {
    const shifted = new Date(now.getTime() + d * 86400000);
    const { year, month, day } = getETDateParts(shifted);
    for (const [hour, minute] of resetTimesET) {
      candidates.push(etPartsToUtc(year, month, day, hour, minute));
    }
  }
  return candidates;
}

const PULL_RESET_TIMES = [
  [6, 30],
  [14, 30],
  [22, 30]
];

const DAILY_RESET_TIMES = [
  [22, 30]
];

function getNextPullReset(now) {
  return getResetCandidates(now, PULL_RESET_TIMES)
    .filter(time => time > now)
    .sort((a, b) => a - b)[0];
}

function getLastDailyReset(now) {
  return getResetCandidates(now, DAILY_RESET_TIMES)
    .filter(time => time <= now)
    .sort((a, b) => b - a)[0];
}

function getNextDailyReset(now) {
  return getResetCandidates(now, DAILY_RESET_TIMES)
    .filter(time => time > now)
    .sort((a, b) => a - b)[0];
}

// ─────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────

function formatTimeLeft(ms) {
  if (ms <= 0) return 'Ready';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / 60000);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`;
}

function formatMinSec(ms) {
  if (ms <= 0) return 'Ready';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

const MANGA_COOLDOWN_MS = 20 * 60 * 1000;
const TRIVIA_COOLDOWN_MS = 20 * 60 * 1000;
const PAGE_COUNT = 2;

function getDuelRewardDisplay(userData, now) {
  if (!userData?.lastDuelRewardAt) return 'Ready';

  const lastDailyReset = getLastDailyReset(now);
  if (userData.lastDuelRewardAt < lastDailyReset) return 'Ready';

  return formatTimeLeft(getNextDailyReset(now) - now);
}

function getRollingDisplay(lastUsed, cooldownMs, now) {
  if (!lastUsed) return 'Ready';
  return formatMinSec(cooldownMs - (now - lastUsed));
}

function buildPageContent(page, userData, now) {
  const lines = [`**Cooldowns** — page **${page + 1}** of **${PAGE_COUNT}**`];

  if (page === 0) {
    lines.push(
      `**Next Reset**: \`${formatTimeLeft(getNextPullReset(now) - now)}\``,
      `**Next Daily**: \`${(() => {
        if (!userData?.lastDailyClaim) return 'Ready';
        return userData.lastDailyClaim < getLastDailyReset(now)
          ? 'Ready'
          : formatTimeLeft(getNextDailyReset(now) - now);
      })()}\``
    );
  } else {
    lines.push(
      `**Next Duel Reward**: \`${getDuelRewardDisplay(userData, now)}\``,
      `**Next Manga**: \`${getRollingDisplay(userData?.lastMangaClaim, MANGA_COOLDOWN_MS, now)}\``,
      `**Next Trivia**: \`${getRollingDisplay(userData?.lastTriviaClaim, TRIVIA_COOLDOWN_MS, now)}\``
    );
  }

  return lines.join('\n');
}

function buildComponents(page, disabled = false) {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: 'timers_previous',
          style: 2,
          label: 'Previous',
          disabled: disabled || page === 0
        },
        {
          type: 2,
          custom_id: 'timers_next',
          style: 2,
          label: 'Next',
          disabled: disabled || page === PAGE_COUNT - 1
        }
      ]
    }
  ];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timers')
    .setDescription('Check your active cooldowns'),

  name: 'timers',
  aliases: ['cooldowns', 'cd', 't'],
  description: 'Shows all active timers and cooldowns.',

  async execute(interactionOrMessage) {
    const user = interactionOrMessage.user || interactionOrMessage.author;
    const isSlash = interactionOrMessage.isChatInputCommand?.();
    const now = new Date();
    const userData = await User.findOne({ userId: user.id });
    let page = 0;

    const buildPayload = (expired = false) => ({
      content: buildPageContent(page, userData, new Date()),
      components: buildComponents(page, expired)
    });

    const payload = {
      ...buildPayload(),
      fetchReply: true
    };

    let response;
    if (isSlash) {
      response = await interactionOrMessage.reply(payload);
    } else {
      const { fetchReply: _, ...sendPayload } = payload;
      response = await interactionOrMessage.channel.send(sendPayload);
    }

    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== user.id) {
        return interaction.reply({ content: `This isn't yours`, flags: 64 });
      }

      if (interaction.customId === 'timers_previous') {
        page = Math.max(0, page - 1);
      } else if (interaction.customId === 'timers_next') {
        page = Math.min(PAGE_COUNT - 1, page + 1);
      } else {
        return;
      }

      collector.resetTimer();
      await interaction.update(buildPayload());
    });

    collector.on('end', () => {
      response.edit(buildPayload(true)).catch(() => {});
    });
  }
};
