const mongoose = require('mongoose');

// A card drop remains in MongoDB from its charge message through its claim
// window. Keeping it server-side makes every button safe across restarts and
// makes the claim atomic across multiple bot instances.
const cardDropSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, default: null },
  cardName: { type: String, default: null },
  rank: { type: String, default: null },
  isShiny: { type: Boolean, default: false },
  imageUrl: { type: String, default: null },
  title: { type: String, default: '' },
  health: { type: Number, default: null },
  power: { type: Number, default: null },
  speed: { type: Number, default: null },
  status: {
    type: String,
    enum: ['charging', 'teaser', 'pending', 'claimed', 'expired'],
    default: 'charging'
  },
  chargeEndsAt: { type: Date, required: true },
  chargeCount: { type: Number, default: 0, min: 0 },
  chargeUserIds: { type: [String], default: [] },
  claimAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  teaserMessageId: { type: String, default: null },
  claimedBy: { type: String, default: null },
  claimedAt: { type: Date, default: null }
}, { timestamps: true });

cardDropSchema.index({ channelId: 1, status: 1 });
cardDropSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('CardDrop', cardDropSchema);