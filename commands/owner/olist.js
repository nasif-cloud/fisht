// Owner-only prefix command: list all owner commands
// Usage: op olist

const OWNER_ID = '1257718161298690119';

module.exports = {
  name: 'olist',

  async execute(message) {
    if (message.author.id !== OWNER_ID) return;

    // Plain-text list — no embed needed, just useful and readable
    const list = [
      '─── OWNER COMMANDS ───',
      '',
      'op obeli @user [amount]         — give Berries to a user',
      'op nobeli @user [amount]        — remove Berries from a user',
      'op omeat @user [amount]         — give Meat to a user',
      'op nomeat @user [amount]        — remove Meat from a user',
      'op ocard @user [cardname] [amount]   — give card copies (name/alias search)',
      'op nocard @user [cardname] [amount]  — remove card copies (name/alias search)',
      'op oshinify @user [cardname]       — make all copies of a card shiny',
      'op noshinify @user [cardname]      — remove shiny status from all copies',
      'op oreset @user [command]            — reset a user\'s rolling cooldown (daily, manga)',
      'op opity @user [S|SS|UR] [pity]       — set a user\'s pity progress',
      'op down                              — toggle normal maintenance (owner still works)',
      'op downall                           — toggle hard lockdown (blocks everyone)',
      'op olist                             — show this list',
      '',
      'Notes:',
      '• All commands are prefix-only.',
      '• Success = green <:Success:1533154745731256531> reaction, no reply.',
      '• Failure = no-ping reply with the error message.',
      '• Cards are searched by name/alias, not mastery title.',
      '• Balance/meat cannot go below 0.',
      '• oreset only clears personal rolling cooldowns, not global pull resets.',
    ].join('\n');

    // Reply without pinging
    await message.reply({ content: `\`\`\`\n${list}\n\`\`\``, allowedMentions: { repliedUser: false } });
  }
};
