// ─────────────────────────────────────────────
// COOLDOWN RESET MAP
// ─────────────────────────────────────────────
// Maps a short command name (what the owner types) to the DB field(s) that
// need to be cleared in the User model to reset that cooldown.
//
// Only rolling personal cooldowns live here — global pull resets are handled
// by a separate schedule and should NOT be touched through this command.
//
// To add a new cooldown in the future, just add a new entry below.

module.exports = {
  // op oreset @user daily → clears lastDailyClaim
  daily: { lastDailyClaim: null },

  // op oreset @user manga → clears lastMangaClaim
  manga: { lastMangaClaim: null },

  // op oreset @user trivia → clears lastTriviaClaim
  trivia: { lastTriviaClaim: null },
};
