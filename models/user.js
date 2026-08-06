const mongoose = require('mongoose');

// Resources and card copies must never be negative, even if an older command
// or a malformed database value tries to write a negative number.
function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

// This file defines what a user's profile looks like in the database.
// Every time someone uses a bot command for the first time, a new User document
// gets created and they receive their starter rewards.
// Think of it like a save file for each player.

const userSchema = new mongoose.Schema({

  // The user's Discord ID — a unique number Discord gives every account.
  // This is how we find the right save file when someone runs a command.
  userId: { type: String, required: true, unique: true },

  // In-game Berries (currency). Displayed as "Berries" to the player.
  // The field is called "balance" internally for historical reasons.
  balance: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // In-game Meat resource. Spent with the eat command to reset pull count.
  meat: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // Inventory items used by the battle and duel reset commands.
  wine: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  beer: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  chests: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneD: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneC: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneB: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneA: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneS: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneSS: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  cloneUR: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // Whether this user has already received their welcome DM and starter rewards.
  // Set to true the first time they run any command, so rewards are only given once.
  accountCreated: { type: Boolean, default: false },

  // The last time the user claimed their daily reward.
  // null means they have never claimed it before.
  lastDailyClaim: { type: Date, default: null },

  // How many card pulls the user has used in the current reset window.
  // Resets automatically when 6:30 AM / 2:30 PM / 10:30 PM ET passes.
  pullsUsed: { type: Number, default: 0 },

  // The timestamp of the last global reset applied to this user.
  // Used to detect when a new reset window has started since their last pull.
  lastPullReset: { type: Date, default: null },

  // The timestamp of the user's most recent pull.
  // Used to enforce the 3-second cooldown between pulls.
  lastPullTime: { type: Date, default: null },

  // Persistent pity progress. These counters are separate from pullsUsed,
  // which resets several times per day and only controls the pull allowance.
  pityS:  { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  pitySS: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
  pityUR: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // The timestamp of the user's most recent team render.
  // Used to enforce a short cooldown on /team and op team.
  lastTeamTime: { type: Date, default: null },

  // The timestamp of the last time this user played the Manga Challenge.
  // Used to enforce the 20-minute rolling cooldown on the manga command.
  lastMangaClaim: { type: Date, default: null },

  // The timestamp of the last time this user played the Trivia Challenge.
  // Used to enforce the 20-minute rolling cooldown on the trivia command.
  lastTriviaClaim: { type: Date, default: null },

  // The timestamp of the user's most recent AI battle.
  // Used to enforce the 30-minute rolling cooldown on /battle and op battle.
  lastBattleTime: { type: Date, default: null },

  // Total experience earned from pulls, manga, trivia, and daily rewards.
  // The profile command calculates the current level from this total.
  xp: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // Reset tokens are awarded when a player reaches a new level.
  resetTokens: { type: Number, default: 0, min: 0, set: nonNegativeNumber },

  // Highest level whose level-up Chest reward has been applied. A null value
  // lets the progression helper reconcile older accounts safely.
  levelUpChestAwardedThrough: { type: Number, default: null, min: 1, set: nonNegativeNumber },

  // Kept for compatibility with profiles that used the previous Meat reward
  // tracker before level rewards changed to Chests.
  levelUpMeatAwardedThrough: { type: Number, default: null, min: 1, set: nonNegativeNumber },

  // A list of every card the user has collected, with how many copies they own.
  // Each entry looks like: { cardName: 'Roronoa Zoro', amount: 3, mastery: 1, lastObtained: <date>, shiny: false }
  cardCopies: [{
    cardName:     { type: String,  required: true },
    amount:       { type: Number,  default: 1, min: 0, set: nonNegativeNumber },
    // Mastery level for this card (1, 2, or 3).
    // This is separate from copy count — having many copies doesn't increase mastery.
    // Mastery only goes up when the player explicitly upgrades the card.
    // All cards start at M1, so we default to 1.
    mastery:      { type: Number,  default: 1 },
    lastObtained: { type: Date,    default: Date.now },
    // Whether this card is shiny for this player.
    // Shiny is "sticky" — once a card becomes shiny it never goes back to normal,
    // even if the player pulls additional non-shiny copies later.
    shiny:        { type: Boolean, default: false }
  }],

  // The user's current combat team, stored as card names.
  // /team and op auto both read and update this list.
  teamCards: { type: [String], default: [] },

  // ── NOTIFICATION SETTINGS ──
  // Reset notifications default to true so new players get ready reminders.
  // The /settings command lets each player flip these on or off.

  // If true, the bot will DM this user when their daily resets (10:30 PM ET).
  dmDailyReady: { type: Boolean, default: true },

  // If true, the bot will DM this user when a pull window resets
  // (6:30 AM, 2:30 PM, and 10:30 PM ET).
  dmPullsReady: { type: Boolean, default: true },

  // If true, level-up messages are sent by DM; false sends them in the
  // channel where the player leveled up.
  dmLevelUp: { type: Boolean, default: false },

  // If true, the bot will DM this user when their daily quests refresh.
  dmQuestsReady: { type: Boolean, default: true },

  // If true, the bot will DM this user when their duel reward becomes ready
  // at the daily reset. The reward itself can only be claimed once per reset.
  dmDuelReward: { type: Boolean, default: true },

  // The last daily-reset window in which this user received a duel reward.
  lastDuelRewardAt: { type: Date, default: null },

  // The last time this user claimed a daily quest.
  lastQuestClaimAt: { type: Date, default: null },

  // Accepted duel counts by opponent for the current and previous months.
  // Old month entries are removed when a new duel is accepted.
  duelMonthlyOpponentCounts: [{
    opponentId: { type: String, required: true },
    monthKey: { type: String, required: true },
    count: { type: Number, default: 0, min: 0, set: nonNegativeNumber }
  }],

  // The three randomly assigned quests for the current daily reset window.
  dailyQuests: [{
    id: { type: String, required: true },
    label: { type: String, required: true },
    progressType: { type: String, required: true },
    target: { type: Number, required: true, min: 1 },
    progress: { type: Number, default: 0, min: 0, set: nonNegativeNumber },
    claimed: { type: Boolean, default: false }
  }],
  dailyQuestsResetAt: { type: Date, default: null }

});

// Export the model so other files (pull.js, balance.js, eat.js, etc.) can use it
module.exports = mongoose.model('User', userSchema);
