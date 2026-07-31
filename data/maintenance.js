// This module holds the bot's maintenance mode state.
// When active is true, all commands are blocked and respond with a maintenance message.
//
// WHY a module? Node.js caches required modules, so every file that does
// require('./data/maintenance') gets the EXACT same object in memory.
// That means when down.js sets state.active = true, index.js sees the change instantly.

const state = { active: false };

module.exports = state;
