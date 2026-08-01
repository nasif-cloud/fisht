// ─────────────────────────────────────────────
// ORESET — Owner cooldown reset
// ─────────────────────────────────────────────
// Clears a specific rolling cooldown for any user.
//
// Usage: op oreset @user [command]
// Example: op oreset @Luffy daily
//          op oreset @Luffy manga
//
// Only touches personal rolling cooldowns defined in data/cooldowns.js.
// Global pull resets are handled by a separate schedule and are NOT affected.

const User      = require('../../models/user');
const cooldowns = require('../../data/cooldowns');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'oreset',

  async execute(message, args) {
    // Silently ignore anyone who isn't the owner
    if (message.author.id !== OWNER_ID) return;

    // ── Parse the target user ──
    // Accept a mention (@User) or a raw user ID
    const target =
      message.mentions.users.first() ||
      (args[0] ? { id: args[0] } : null);

    if (!target) {
      return message.reply({
        content: 'Please mention a user or provide their ID.\nUsage: `op oreset @user [command]`',
        allowedMentions: { repliedUser: false }
      });
    }

    // ── Parse the command name ──
    // args[0] is the mention token if present, args[1] (or args[0] if no mention) is the command
    const cmdArg = (message.mentions.users.size > 0 ? args[1] : args[1])?.toLowerCase();

    if (!cmdArg) {
      const available = Object.keys(cooldowns).join(', ');
      return message.reply({
        content: `Please specify a command to reset. Available: \`${available}\`\nUsage: \`op oreset @user [command]\``,
        allowedMentions: { repliedUser: false }
      });
    }

    // ── Look up the cooldown entry ──
    const resetFields = cooldowns[cmdArg];
    if (!resetFields) {
      const available = Object.keys(cooldowns).join(', ');
      return message.reply({
        content: `Unknown command: \`${cmdArg}\`. Available: \`${available}\``,
        allowedMentions: { repliedUser: false }
      });
    }

    // ── Apply the reset ──
    // $set writes the null values directly — only the listed field(s) are touched
    const result = await User.findOneAndUpdate(
      { userId: target.id },
      { $set: resetFields }
    );

    if (!result) {
      return message.reply({
        content: `No account found for that user.`,
        allowedMentions: { repliedUser: false }
      });
    }

    // React with ✅ to confirm — same style as the other owner commands
    await message.react('✅');
  }
};
