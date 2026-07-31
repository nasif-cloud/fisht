const {SlashCommandBuilder, EmbedBuilder} = require('discord.js');

module.exports = {
    // slash command
    data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('See a list of commands.'),

    // prefix command
    name: 'help',
    aliases: ['h'],
    description: 'See a list of commands.',

    async execute(interactionOrMessage) {
   const embed = new EmbedBuilder()
  .setTitle("Help menu: Commands")
  .setDescription("**Cards**\n`pull`, `info`, `copies`, `eat`, `collection`, `myinfo`, `upgrade`\n\n**Economy**\n`balance`, `daily`, `vote`, `profile`, `trade`, `shop`, `buy`, `sell`\n\n**Utility**\n`help`, `cooldowns`, `level`, `autolist`, `safelist`, `leaderboard`\n\n**Fun**\n`trivia`, `manga`\n\n**Combat**\n`crew`, `crewadd`, `crewremove`, `battle`\n\n**Items**\n`inventory`\n\n**Admin**\n...")  
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