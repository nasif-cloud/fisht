require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Initialize the Discord Client with required Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// so it can hold loaded commands
client.commands = new Collection();

// Main async function to handle startup order
async function startBot() {
  try {
    // 1. Connect to MongoDB first
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Successfully connected to MongoDB Atlas!');

    // 2. Log in to Discord
    console.log('Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error(' Startup failed:', error);
    process.exit(1);
  }
}

// Event: Fires once when the bot successfully logs in
client.once('ready', () => {
  console.log(` Ready! Logged in as ${client.user.tag}`);
});

// so slash commands work
client.on('interactionCreate', async interaction => {
  // Ignore interactions that aren't slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    // Run the command
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    // If something broke mid-execution, send an error reply so Discord doesn't hang
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', flags: 64 });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', flags: 64 });
    }
  }
});

// Event: Basic test command listener
client.on('messageCreate', async (message) => {
  // Ignore messages from other bots or direct messages
  if (message.author.bot || !message.guild) return;

  //prefix
  const prefix = 'op';

  //ignore other prefixes, and let upercase OP work
  if (!message.content.toLowerCase().startsWith(prefix)) return;

  //extract the command name after "op " *so it runs that command/recongnized by that command
  // slices the prefix, trims whitespace from beggining and end and splits the remaining string into the args (command names), but discord only takes the first arg.
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  //find any command in client.commands
  const command = client.commands.get(commandName);
  if (!command) return `**${commandName}** is not a command.`;


  try {
    // Run the command's execute function
    await command.execute(message);
  } catch (error) {
console.error(`Error executing command ${commandName};`, error);
await message.channel.send(`Error running command.`);
  }

  // Simple ping command
  if (message.content === '!pod') {
    await message.channel.send('Pong!  Bot and Database are connected and running.');
  }
});

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    // Save by command name (so we can find it later)
    if (command.name && command.execute) {
      client.commands.set(command.name, command);

      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          client.commands.set(alias, command);
        }
      }
      console.log(`Loaded command: ${command.name}`);
    }
  }
}

// Boot up the bot
startBot();