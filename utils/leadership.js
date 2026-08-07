// ─────────────────────────────────────────────
// SERVICE LEADERSHIP GUARD
// ─────────────────────────────────────────────
// The bot can occasionally be running as two instances ("streaming twice"). Only
// the newest deploy may act as the main one — older instances must stop
// responding to everything, including button/dropdown clicks on messages their
// collectors still hold.
//
// Command collectors listen on the client independently of index.js, so a stale
// instance's collector would otherwise STILL acknowledge the same click the
// leader instance handles, producing "Interaction has already been
// acknowledged". This module shares the current leadership flag so every command
// can check it synchronously before doing anything with a click.

// In-memory leadership flag, kept in sync with the service lease in index.js.
// Defaults to FALSE so that a stale/older deploy never acknowledges any
// interaction until it has actively won ownership of the service lease — this
// is what prevents the "Interaction has already been acknowledged" errors
// that happen when two instances (e.g. a re-deploy still streaming) both
// respond to the same button/dropdown click.
let isLeader = false;

// Called by index.js whenever the service lease changes (gained/lost leadership).
function setLeadership(value) {
  isLeader = Boolean(value);
}

// Synchronous check any command can use: returns true only if THIS instance is
// currently the main (newest) deploy and should handle interactions.
function isLeaderNow() {
  return isLeader;
}

module.exports = { setLeadership, isLeaderNow };
