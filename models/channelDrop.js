const mongoose = require('mongoose');

// One document controls automatic card drops for one guild channel.
// Activity is reset whenever a new drop is created so each interval measures
// the conversation that happened after the previous drop.
const channelDropSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  enabledBy: { type: String, default: null },
  enabledAt: { type: Date, default: Date.now },
  lastDropAt: { type: Date, default: null },
  lastMessageAt: { type: Date, default: null },
  messagesSinceDrop: { type: Number, default: 0, min: 0 },
  activeUserIds: { type: [String], default: [] },
  pendingDropId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CardDrop',
    default: null
  }
});

channelDropSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

module.exports = mongoose.model('ChannelDrop', channelDropSchema);