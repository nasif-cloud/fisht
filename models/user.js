const mongoose = require('mongoose');

// Define what a User's database profile looks like
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  lastDailyClaim: { type: Date, default: null },
  pullsUsed: { type: Number, default: 0 },       // pulls used in the current reset window
  lastPullReset: { type: Date, default: null },   // timestamp of the last reset applied to this user
  lastPullTime: { type: Date, default: null }     // timestamp of the user's most recent pull (for cooldown)
});

// Export it so daily.js can use it
module.exports = mongoose.model('User', userSchema);