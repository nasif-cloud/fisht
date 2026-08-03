// ─────────────────────────────────────────────
// CHANNEL COMMAND RESTRICTIONS
// ─────────────────────────────────────────────
// Stores which bot commands are blocked in each Discord channel.
// This is persisted in MongoDB so restrictions survive bot restarts.
//
// One document exists per guild/channel pair:
//   blockAll       — when true, every bot command is blocked in the channel
//   blockedCommands — specific command names blocked in the channel
//   allowedCommands — exceptions that remain usable when blockAll is true

const mongoose = require('mongoose');

const channelRestrictionSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true
  },
  channelId: {
    type: String,
    required: true
  },
  blockAll: {
    type: Boolean,
    default: false
  },
  blockedCommands: {
    type: [String],
    default: []
  },
  allowedCommands: {
    type: [String],
    default: []
  }
});

// A guild can have only one restriction document for a channel.
channelRestrictionSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.model('ChannelRestriction', channelRestrictionSchema);