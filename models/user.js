const mongoose = require('mongoose');

// Define what a User's database profile looks like
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  lastDailyClaim: { type: Date, default: null }
});

// Export it so daily.js can use it
module.exports = mongoose.model('User', userSchema);