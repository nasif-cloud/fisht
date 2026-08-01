// ─────────────────────────────────────────────
// COMMAND LOCK
// ─────────────────────────────────────────────
// Prevents duplicate command processing when the bot is running from
// more than one place at the same time (e.g. Replit + local machine).
//
// How it works:
//   Before processing any command, we try to INSERT a document whose
//   _id is the unique Discord message/interaction ID.
//   - If the insert succeeds  → this instance handles the command.
//   - If it fails with code 11000 (duplicate key) → another instance
//     already claimed this event; we skip it silently.
//
// The TTL index automatically deletes old lock documents after 10 seconds
// so the collection never grows unboundedly.

const mongoose = require('mongoose');

const commandLockSchema = new mongoose.Schema({
  // The unique Discord event ID (message.id or interaction.id)
  eventId: { type: String, required: true, unique: true },

  // Timestamp used by the TTL index — MongoDB deletes this doc 10 s after creation
  createdAt: { type: Date, default: Date.now, expires: 10 }
});

module.exports = mongoose.model('CommandLock', commandLockSchema);
