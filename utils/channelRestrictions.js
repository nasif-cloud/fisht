// ─────────────────────────────────────────────
// CHANNEL RESTRICTION HELPERS
// ─────────────────────────────────────────────
// Keeps the database operations for the allow/disallow commands and the
// central command handler in one beginner-friendly place.

const ChannelRestriction = require('../models/channelRestriction');

function normalizeCommandName(commandName) {
  return String(commandName || '').trim().toLowerCase();
}

// Return the matching restriction details for a command in a guild channel.
async function getCommandRestriction(guildId, channelId, commandName) {
  const restriction = await ChannelRestriction.findOne({ guildId, channelId }).lean();
  if (!restriction) return { blocked: false, blockAll: false };

  const normalizedName = normalizeCommandName(commandName);
  const allowedByException = restriction.allowedCommands?.includes(normalizedName);
  const blocked = restriction.blockAll
    ? !allowedByException
    : restriction.blockedCommands?.includes(normalizedName);

  return {
    blocked: Boolean(blocked),
    blockAll: Boolean(restriction.blockAll)
  };
}

// Return true when a command is blocked in a guild channel.
async function isCommandBlocked(guildId, channelId, commandName) {
  const restriction = await getCommandRestriction(guildId, channelId, commandName);
  return restriction.blocked;
}

// Block either every command or one specific command in a channel.
async function disallowCommands(guildId, channelId, commandName) {
  if (!commandName) {
    await ChannelRestriction.findOneAndUpdate(
      { guildId, channelId },
      { $set: { blockAll: true, blockedCommands: [], allowedCommands: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return;
  }

  await ChannelRestriction.findOneAndUpdate(
    { guildId, channelId },
    {
      $pull: { allowedCommands: normalizeCommandName(commandName) },
      $addToSet: { blockedCommands: normalizeCommandName(commandName) }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// Remove either every restriction or one specific command restriction.
async function allowCommands(guildId, channelId, commandName) {
  if (!commandName) {
    await ChannelRestriction.deleteOne({ guildId, channelId });
    return;
  }

  const restriction = await ChannelRestriction.findOne({ guildId, channelId });
  if (!restriction) return;

  const normalizedName = normalizeCommandName(commandName);
  restriction.blockedCommands = restriction.blockedCommands.filter(name => name !== normalizedName);

  // A channel-wide block needs an explicit exception to allow one command.
  // For a specific-command restriction, simply removing it is enough.
  if (restriction.blockAll && !restriction.allowedCommands.includes(normalizedName)) {
    restriction.allowedCommands.push(normalizedName);
  }
  await restriction.save();

  // Clean up empty documents so the collection stays small.
  await ChannelRestriction.deleteOne({
    guildId,
    channelId,
    blockAll: false,
    blockedCommands: { $size: 0 },
    allowedCommands: { $size: 0 }
  });
}

module.exports = {
  normalizeCommandName,
  getCommandRestriction,
  isCommandBlocked,
  disallowCommands,
  allowCommands
};