const mongoose = require('mongoose');

// This file defines what a user's profile looks like in the database.
// Every time someone uses a bot command for the first time, a new User document
// gets created here automatically. Think of it like a save file for each player.

const userSchema = new mongoose.Schema({

  // The user's Discord ID (a unique number Discord gives every account).
  // This is how we look up the right save file when someone uses a command.
  userId: { type: String, required: true, unique: true },

  // How much in-game currency the user has.
  balance: { type: Number, default: 0 },

  // The last time the user claimed their daily reward.
  // null means they've never claimed it.
  lastDailyClaim: { type: Date, default: null },

  // How many card pulls the user has used in the current reset window.
  // This resets automatically when a new reset period starts (6:30 AM / 2:30 PM / 10:30 PM ET).
  pullsUsed: { type: Number, default: 0 },

  // The timestamp of the last reset that was applied to this user.
  // Used to detect when a new reset window has started since their last pull.
  lastPullReset: { type: Date, default: null },

  // The timestamp of the user's most recent pull.
  // Used to enforce the 3-second cooldown between pulls.
  lastPullTime: { type: Date, default: null },

  // A list of every card the user has collected, along with how many copies they have.
  // Each entry looks like: { cardName: 'Roronoa Zoro', amount: 3, lastObtained: <date> }
  cardCopies: [{
    // The card's name — used to look up its rank, image, etc. from data/cards.js
    cardName:     { type: String, required: true },
    // How many copies of this card the user has
    amount:       { type: Number, default: 1 },
    // The last time the user got a copy of this card (used for "By date" sorting)
    lastObtained: { type: Date, default: Date.now }
  }]

});

// Export so other files (like pull.js, info.js, copies.js) can read and update user data
module.exports = mongoose.model('User', userSchema);
