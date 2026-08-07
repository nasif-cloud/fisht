// ─────────────────────────────────────────────
// INTERACTION LOCK
// ─────────────────────────────────────────────
// Race-free duplicate prevention for message-component interactions
// (buttons, dropdowns, select menus) — the component-interaction equivalent
// of the CommandLock already used for slash/prefix commands in index.js.
//
// Why this matters:
//   The bot can run as two instances at once (e.g. a re-deploy still
//   streaming). Both receive the SAME component interaction via the gateway.
//   The in-memory `isLeaderNow()` flag in utils/leadership.js keeps stale
//   deploys from acknowledging, but it only refreshes every few seconds, so
//   during a leadership handoff two collectors can both fire and the second
//   `interaction.update`/`reply` throws "Interaction has already been
//   acknowledged."
//
//   This lock mirrors the slash-command path: whichever instance inserts a
//   lock document for this interaction's id first wins and proceeds; the
//   other gets a duplicate-key (11000) error and returns immediately without
//   acknowledging.
//
// How it's used in command files:
//   collector.on('collect', async interaction => {
//     if (!isLeaderNow()) return;                       // newest-push guard
//     if (!(await claimInteractionLock(interaction.id))) return; // race-free dedup
//     ...
//   });

const CommandLock = require('../models/commandLock');
const { isLeaderNow } = require('./leadership');

async function claimInteractionLock(interactionId) {
  if (!isLeaderNow()) return false;
  try {
    await CommandLock.create({ eventId: interactionId });
    return true; // this instance won the race — proceed
  } catch (err) {
    if (err.code === 11000) return false; // another instance claimed it first
    throw err; // non-duplicate errors propagate to the collector's handler
  }
}

module.exports = { claimInteractionLock };
