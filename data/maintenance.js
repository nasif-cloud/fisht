// This module holds the bot's maintenance mode state in memory AND in MongoDB.
//
// Node.js caches required modules, so every file that does
// require('./data/maintenance') gets the EXACT same object in memory.
// That means toggling a flag here is instantly visible everywhere.
//
// TWO flags:
//   active — normal maintenance. Non-owners are blocked; the owner can still
//             use all commands as usual (handy for testing while down).
//   full   — hard lockdown. EVERYONE is blocked, including the owner.
//             The only commands that always pass through are 'down' and 'downall'
//             so the owner can always turn maintenance back off.
//
// PERSISTENCE:
//   Call `maintenance.load()` once on startup (after MongoDB connects) to
//   restore the last-saved flags from the database.
//   Call `maintenance.save()` after every toggle to persist the new state so
//   it survives bot restarts / console resets.

const MaintenanceState = require('../models/maintenanceState');

const state = {
  active: false, // Toggle with: op down
  full:   false, // Toggle with: op downall

  // ─── load ────────────────────────────────────────────────────────────────
  // Call once after MongoDB is connected. Reads the persisted flags and
  // applies them to this in-memory object so the bot starts in the correct state.
  async load() {
    try {
      // findById returns null if no document exists yet — that's fine, we keep defaults
      const doc = await MaintenanceState.findById('singleton');
      if (doc) {
        state.active = doc.active;
        state.full   = doc.full;
      }
      console.log(`[Maintenance] Loaded — active: ${state.active}, full: ${state.full}`);
    } catch (err) {
      // Non-fatal: we'll just start with both flags off
      console.error('[Maintenance] Failed to load state from MongoDB:', err);
    }
  },

  // ─── save ────────────────────────────────────────────────────────────────
  // Call after every toggle. Upserts the singleton document so the current
  // in-memory flags are durable across restarts.
  async save() {
    try {
      await MaintenanceState.findByIdAndUpdate(
        'singleton',
        { active: state.active, full: state.full },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error('[Maintenance] Failed to save state to MongoDB:', err);
    }
  },
};

module.exports = state;
