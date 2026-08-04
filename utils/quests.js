// ─────────────────────────────────────────────
// DAILY QUESTS
// ─────────────────────────────────────────────
// Quests are assigned per player at the global daily reset (10:30 PM ET).
// Progress is stored on the player document so it survives bot restarts.

const QUEST_COUNT = 3;
const QUEST_REWARD_BELI = 1_000;
const QUEST_REWARD_XP = 30;
const ALL_QUESTS_REWARD_MEAT = 1;

const PROGRESS_EMOJIS = {
  greyLeft: '<:grey_left_bar_argenx:1534060730683232398>',
  greyMiddle: '<:grey_middle_bar_argenx:1534060728875749446>',
  greyRight: '<:grey_right_bar_argenx:1534060727806201997>',
  greenLeft: '<:green_left_bar_argenx:1534060733766041620>',
  greenMiddle: '<:green_middle_bar_argenx:1534060732424130683>',
  greenRight: '<:green_rigth_bar_argenx:1534060731778076732>'
};

const QUEST_POOL = [
  { id: 'pull_15', label: 'Pull 15 cards', progressType: 'pull', target: 15 },
  { id: 'manga_correct_3', label: 'Get 3 `manga` challenges correct', progressType: 'manga_correct', target: 3 },
  { id: 'trivia_correct_3', label: 'Get 3 `trivia` challenges correct', progressType: 'trivia_correct', target: 3 },
  { id: 'manga_5', label: 'Do 5 `manga` challenges', progressType: 'manga_play', target: 5 },
  { id: 'trivia_5', label: 'Do 5 `trivia` challenges', progressType: 'trivia_play', target: 5 },
  { id: 'collection', label: 'Check your `collection`', progressType: 'collection', target: 1 },
  { id: 'eat_1', label: '`Eat` 1 meat to reset your pulls', progressType: 'eat', target: 1 },
  { id: 'info_3', label: 'Check the `info` of 3 cards', progressType: 'info', target: 3 },
  { id: 'xp_50', label: 'Earn 50 XP', progressType: 'xp', target: 50 },
  { id: 'leaderboard', label: 'Check the `leaderboard`', progressType: 'leaderboard', target: 1 }
];

function getETDateParts(date) {
  const str = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const match = str.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
  return {
    year: Number(match[3]),
    month: Number(match[1]),
    day: Number(match[2]),
    hour: Number(match[4]) % 24,
    minute: Number(match[5])
  };
}

function etPartsToUtc(year, month, day, hour, minute) {
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute));
    const parts = getETDateParts(candidate);
    if (parts.hour === hour % 24 && parts.minute === minute) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day, hour + 5, minute));
}

function getDailyResetCandidates(now) {
  const candidates = [];
  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    const shifted = new Date(now.getTime() + dayOffset * 86400000);
    const { year, month, day } = getETDateParts(shifted);
    candidates.push(etPartsToUtc(year, month, day, 22, 30));
  }
  return candidates;
}

function getLastDailyReset(now = new Date()) {
  return getDailyResetCandidates(now)
    .filter(candidate => candidate <= now)
    .sort((a, b) => b - a)[0];
}

function getNextDailyReset(now = new Date()) {
  return getDailyResetCandidates(now)
    .filter(candidate => candidate > now)
    .sort((a, b) => a - b)[0];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeQuest(quest) {
  return {
    id: quest.id,
    label: quest.label,
    progressType: quest.progressType,
    target: quest.target,
    progress: 0,
    claimed: false
  };
}

function assignQuests(userData, resetAt) {
  userData.dailyQuests = shuffle(QUEST_POOL)
    .slice(0, QUEST_COUNT)
    .map(makeQuest);
  userData.dailyQuestsResetAt = resetAt;
  return userData;
}

function ensureDailyQuests(userData, now = new Date()) {
  if (!userData) return userData;

  const resetAt = getLastDailyReset(now);
  const currentResetAt = userData.dailyQuestsResetAt
    ? new Date(userData.dailyQuestsResetAt)
    : null;
  const hasValidQuests =
    Array.isArray(userData.dailyQuests) &&
    userData.dailyQuests.length === QUEST_COUNT;

  if (!hasValidQuests || !currentResetAt || currentResetAt < resetAt) {
    assignQuests(userData, resetAt);
  }

  return userData;
}

function updateQuestProgress(userData, progressType, amount = 1) {
  ensureDailyQuests(userData);
  const safeAmount = Math.max(0, Number(amount) || 0);
  if (!safeAmount) return false;

  let changed = false;
  for (const quest of userData.dailyQuests || []) {
    if (quest.claimed || quest.progressType !== progressType) continue;
    const nextProgress = Math.min(quest.target, quest.progress + safeAmount);
    if (nextProgress !== quest.progress) {
      quest.progress = nextProgress;
      changed = true;
    }
  }
  return changed;
}

function claimQuest(userData, questIndex) {
  ensureDailyQuests(userData);
  const quest = userData.dailyQuests?.[questIndex];

  if (!quest) {
    return { ok: false, reason: 'That quest is no longer available.' };
  }
  if (quest.claimed) {
    return { ok: false, reason: 'You have already claimed that quest.' };
  }
  if (quest.progress < quest.target) {
    return {
      ok: false,
      reason: `You need **${quest.target - quest.progress}** more progress to claim this quest.`
    };
  }

  quest.claimed = true;
  const allClaimed = userData.dailyQuests.every(item => item.claimed);
  if (allClaimed) {
    userData.meat = (Number(userData.meat) || 0) + ALL_QUESTS_REWARD_MEAT;
  }

  return { ok: true, quest, allClaimed };
}

function buildProgressBar(progress, target) {
  const safeTarget = Math.max(1, Number(target) || 1);
  const safeProgress = Math.min(safeTarget, Math.max(0, Number(progress) || 0));
  const filled = safeProgress >= safeTarget
    ? 10
    : Math.floor((safeProgress / safeTarget) * 10);

  const segments = [];
  for (let index = 0; index < 10; index += 1) {
    const isGreen = index < filled;
    const isFirst = index === 0;
    const isLast = index === 9;
    if (isGreen) {
      segments.push(
        isFirst ? PROGRESS_EMOJIS.greenLeft :
          isLast ? PROGRESS_EMOJIS.greenRight : PROGRESS_EMOJIS.greenMiddle
      );
    } else {
      segments.push(
        isFirst ? PROGRESS_EMOJIS.greyLeft :
          isLast ? PROGRESS_EMOJIS.greyRight : PROGRESS_EMOJIS.greyMiddle
      );
    }
  }
  return segments.join('');
}

module.exports = {
  QUEST_COUNT,
  QUEST_REWARD_BELI,
  QUEST_REWARD_XP,
  ALL_QUESTS_REWARD_MEAT,
  QUEST_POOL,
  getLastDailyReset,
  getNextDailyReset,
  ensureDailyQuests,
  updateQuestProgress,
  claimQuest,
  buildProgressBar
};