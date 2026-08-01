// This module holds the bot's maintenance mode state.
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

const state = {
  active: false, // Toggle with: op down
  full:   false, // Toggle with: op downall
};

module.exports = state;
