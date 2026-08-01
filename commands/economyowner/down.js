// Owner-only command: toggle maintenance mode on/off.
// When maintenance mode is active, every command (prefix and slash) is blocked
// and replies with "Bot is in Maintenance, come back later".
//
// Usage: op down
// Only the user whose Discord ID matches OWNER_ID can run this.

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

    // React with a green checkmark to confirm the change
    await message.react('<:Success:1533154745731256531>');
  }
};
