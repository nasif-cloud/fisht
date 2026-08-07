const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
// Make sure your config file has TOKEN and CLIENT_ID.
// GUILD_ID is only needed when using DEPLOY_SCOPE=guild.
require('dotenv').config();

const commands = [];
// Grab all the command folders from the commands directory
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  // Grab all the command files from the subfolders
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Read the 'data' property (SlashCommandBuilder) from each command
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Global commands work in every server where the bot is installed. Discord can
// take up to an hour to show global command changes, so use guild scope while
// testing a command that needs to appear immediately.
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const deployScope = (process.env.DEPLOY_SCOPE || 'global').toLowerCase();
    let route;

    if (deployScope === 'guild') {
      if (!process.env.GUILD_ID) {
        throw new Error('DEPLOY_SCOPE=guild requires GUILD_ID');
      }
      route = Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      );
      console.log(`Deploying commands to guild ${process.env.GUILD_ID}`);
    } else if (deployScope === 'global') {
      route = Routes.applicationCommands(process.env.CLIENT_ID);
      console.log('Deploying commands globally to every server with the bot');
    } else {
      throw new Error(`Unknown DEPLOY_SCOPE "${deployScope}". Use "global" or "guild".`);
    }

    // Replacing the complete command set in one request updates existing
    // commands and adds new ones without repeated delete/create operations.
    const data = await rest.put(
      route,
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();