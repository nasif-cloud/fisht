// ─────────────────────────────────────────────
// DOWNALL — Hard lockdown maintenance toggle
// ─────────────────────────────────────────────
// Toggles the "full" maintenance flag, which blocks EVERYONE — including
// the owner — from using any command. Only 'down' and 'downall' themselves
// always pass through so the owner can always turn it back off.
//
// Usage: op downall
// Compare: op down → normal maintenance (owner still works)
//          op downall → hard lockdown (nobody works)

const maintenance = require('../../data/maintenance');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'downall',

  async execute(message) {
    // Silently ignore anyone who isn't the owner
    if (message.author.id !== OWNER_ID) return;

    // Flip the full-lockdown flag: true → false, false → true
    maintenance.full = !maintenance.full;

    // React with ✅ to confirm
    await message.react('✅');
  }
};
