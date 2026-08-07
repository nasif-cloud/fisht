// ─────────────────────────────────────────────
// OPEN COMMAND
// ─────────────────────────────────────────────
// The slash command uses one entry point for both container types:
// `/open chest [amount]` and `/open crate [amount]`.
//
// Prefix users can continue using `op chest` and `op crate` as before.

const { SlashCommandBuilder } = require('discord.js');
const chestCommand = require('./chest');
const crateCommand = require('./crate');

const OPENERS = {
  chest: chestCommand,
  crate: crateCommand
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open Chests or Crates')
    .addStringOption(option =>
      option
        .setName('item')
        .setDescription('Which container to open')
        .setRequired(true)
        .addChoices(
          { name: 'Chest', value: 'chest' },
          { name: 'Crate', value: 'crate' }
        )
    )
    .addStringOption(option =>
      option
        .setName('amount')
        .setDescription('How many to open, or all')
        .setRequired(false)
    ),

  name: 'open',

  async execute(interactionOrMessage) {
    const item = interactionOrMessage.options.getString('item');
    const opener = OPENERS[item];

    // The choices above prevent this for normal slash use, but keep an
    // explicit response here in case Discord sends an unexpected value.
    if (!opener) {
      return interactionOrMessage.reply({
        content: 'Choose either `chest` or `crate`',
        flags: 64
      });
    }

    return opener.execute(interactionOrMessage);
  }
};