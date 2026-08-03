const mongoose = require('mongoose');

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
  balance: { type: Number, default: 0 },

  // In-game Meat resource. Spent with the eat command to reset pull count.
  meat: { type: Number, default: 0 },

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

  // The timestamp of the user's most recent team render.
  // Used to enforce a short cooldown on /team and op team.
  lastTeamTime: { type: Date, default: null },

  // The timestamp of the last time this user played the Manga Challenge.
  // Used to enforce the 20-minute rolling cooldown on the manga command.
  lastMangaClaim: { type: Date, default: null },

  // The timestamp of the last time this user played the Trivia Challenge.
  // Used to enforce the 20-minute rolling cooldown on the trivia command.
  lastTriviaClaim: { type: Date, default: null },

  // A list of every card the user has collected, with how many copies they own.
  // Each entry looks like: { cardName: 'Roronoa Zoro', amount: 3, mastery: 1, lastObtained: <date>, shiny: false }
  cardCopies: [{
    cardName:     { type: String,  required: true },
    amount:       { type: Number,  default: 1 },
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
  // Both default to true so new players get DMs out of the box.
  // The /settings command lets each player flip these on or off.

  // If true, the bot will DM this user when their daily resets (10:30 PM ET).
  dmDailyReady: { type: Boolean, default: true },

  // If true, the bot will DM this user when a pull window resets
  // (6:30 AM, 2:30 PM, and 10:30 PM ET).
  dmPullsReady: { type: Boolean, default: true }

});

// Export the model so other files (pull.js, balance.js, eat.js, etc.) can use it
module.exports = mongoose.model('User', userSchema);
