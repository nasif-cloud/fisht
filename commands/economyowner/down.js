// Owner-only command: toggle maintenance mode on/off.
// When maintenance mode is active, every command (prefix and slash) is blocked
// and replies with "Bot is in Maintenance, come back later".
//
// Usage: op down
// Only the user whose Discord ID matches OWNER_ID can run this.
//
// Reactions:
//   ⬇️  — bot just went DOWN (maintenance enabled)
//   ⬆️  — bot just came UP   (maintenance disabled)

const maintenance = require('../../data/maintenance');

// Must match the OWNER_ID used in the other owner commands
const OWNER_ID = '1257718161298690119';

module.exports = {
  // No 'data' property — this is prefix-only, just like the other owner commands
  name: 'down',

  async execute(message) {
    // Silently ignore anyone who isn't the owner
    if (message.author.id !== OWNER_ID) return;

    // Flip the maintenance flag: true → false, false → true
    maintenance.active = !maintenance.active;

    // Persist the new state so it survives bot restarts
    await maintenance.save();

    // React to show which direction the toggle went:
    // ⬇️ = going into maintenance (down), ⬆️ = coming out of maintenance (up)
    const reaction = maintenance.active ? '⬇️' : '⬆️';
    await message.react(reaction);
  }
};
