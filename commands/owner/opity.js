// ─────────────────────────────────────────────
// OPITY — Owner pity setter
// ─────────────────────────────────────────────
// Usage: op opity @user [pityrank] [pity]

const User = require('../../models/user');
const { PITY_FIELDS, PITY_THRESHOLDS } = require('../../utils/pity');

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'opity',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    const parts = message.content.trim().split(/ +/);
    const target = message.mentions.users.first();
    const rank = String(parts[3] || '').toUpperCase();
    const amount = Number(parts[4]);

    if (!target) {
      return message.reply({
        content: 'Please mention a user.\nUsage: `op opity @user [S|SS|UR] [pity]`',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!PITY_FIELDS[rank]) {
      return message.reply({
        content: 'Please specify a pity rank: `S`, `SS`, or `UR`.',
        allowedMentions: { repliedUser: false }
      });
    }
    if (!Number.isInteger(amount) || amount < 0 || amount > PITY_THRESHOLDS[rank]) {
      return message.reply({
        content: `Please provide a whole-number pity from **0** to **${PITY_THRESHOLDS[rank]}** for ${rank}.`,
        allowedMentions: { repliedUser: false }
      });
    }

    let userData = await User.findOne({ userId: target.id });
    if (!userData) userData = new User({ userId: target.id });
    userData[PITY_FIELDS[rank]] = amount;
    await userData.save();

    await message.react('<:Success:1533154745731256531>');
  }
};