const {SlashCommandBuilder, EmbedBuilder} = require('discord.js');

module.exports = {
    // slash command
    data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See a list of commands (not all of them work)'),

    // prefix command
    name: 'help',
    aliases: ['h'],
    description: 'See a list of commands.',

    async execute(interactionOrMessage) {
   const embed = new EmbedBuilder()
  .setTitle("Help menu: Commands")
  .setDescription("**Cards**\n`pull`, `info`, `copies`, `eat`, `collection`, `mycard`, `allcards`,\n\n**Economy**\n`balance`, `daily`, `shop`, `buy`\n\n**Utility**\n`help`, `profile`, `timers`, `settings`, `quests`, `leaderboard`\n\n**Fun**\n`trivia`,`manga`\n\n**Combat**\n`team`, `autoteam`, `teamadd`, `teamremove`, `battle`, `duel`\n\n**Items**\n...\n\n**Admin**\n`allow`, `disallow`")
  .setColor(0xffffff);

     // Check if its a slash command
if (interactionOrMessage.isChatInputCommand?.()) {
  if (interactionOrMessage.replied || interactionOrMessage.deferred) {
    await interactionOrMessage.followUp({ embeds: [embed] });
  } else {
    await interactionOrMessage.reply({ embeds: [embed] });
  }
} else {
  // if its prefix
  await interactionOrMessage.channel.send({ embeds: [embed] });
}
     }
}