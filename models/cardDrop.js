const mongoose = require('mongoose');

// A card drop remains in MongoDB while its claim button is active.
// Keeping it server-side makes the claim atomic and lets buttons continue
// working after a bot restart.
const cardDropSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  cardName: { type: String, required: true },
  rank: { type: String, required: true },
  isShiny: { type: Boolean, default: false },
  imageUrl: { type: String, required: true },
  title: { type: String, default: '' },
  health: { type: Number, required: true },
  power: { type: Number, required: true },
  speed: { type: Number, required: true },
  status: {
    type: String,
    enum: ['teaser', 'pending', 'claimed', 'expired'],
    default: 'teaser'
  },
  claimAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  teaserMessageId: { type: String, default: null },
  claimedBy: { type: String, default: null },
  claimedAt: { type: Date, default: null }
}, { timestamps: true });

cardDropSchema.index({ channelId: 1, status: 1 });
cardDropSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('CardDrop', cardDropSchema);