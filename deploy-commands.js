const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
// Make sure your config file has TOKEN, CLIENT_ID, and optionally GUILD_ID
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

// Deploy your commands!
(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Replacing the guild command set in one request updates existing commands
    // and adds new ones without repeatedly clearing and recreating everything.
    // This avoids Discord's daily application-command creation limit.
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();