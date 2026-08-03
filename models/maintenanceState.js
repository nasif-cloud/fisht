// ─────────────────────────────────────────────
// MAINTENANCE STATE
// ─────────────────────────────────────────────
// Stores the bot's maintenance flags in MongoDB so they survive bot restarts.
//
// We use a "singleton" document pattern: there is always exactly ONE doc
// in this collection, identified by _id: 'singleton'. On first access it is
// created with both flags set to false (the safe default).
//
// Fields:
//   active — normal maintenance. Non-owners are blocked; owner still works.
//   full   — hard lockdown. EVERYONE is blocked (owner too), except down/downall.

const mongoose = require('mongoose');

const maintenanceStateSchema = new mongoose.Schema({
  // Fixed ID so there is always exactly one document in this collection
  _id: { type: String, default: 'singleton' },

  // Toggle with: op down
  active: { type: Boolean, default: false },

  // Toggle with: op downall
  full: { type: Boolean, default: false },
});

module.exports = mongoose.model('MaintenanceState', maintenanceStateSchema);
