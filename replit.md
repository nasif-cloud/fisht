# Fisht — One Piece Discord Bot

A One Piece–themed Discord bot with an economy and card-pulling system, built with discord.js v14, MongoDB, and a small Express keepalive server.

## How to run

The **Start application** workflow runs `node index.js`. Start or restart it from the Replit interface.

## Required secrets

Set these in the Replit Secrets panel before starting:

| Secret | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Application/client ID from the Developer Portal |
| `GUILD_ID` | Server ID used only when `DEPLOY_SCOPE=guild` |
| `MONGODB_URI` | MongoDB Atlas connection string |

## Deploying slash commands

Run this once after adding or changing commands:

```
node deploy-commands.js
```

By default, this registers slash commands globally so they appear in every server where the bot is installed. Global updates can take up to an hour to appear.

For instant testing in one server, run:

```
DEPLOY_SCOPE=guild node deploy-commands.js
```

That uses the server ID in `GUILD_ID`. Return to global deployment with:

```
node deploy-commands.js
```

## Project structure

```
index.js              — Bot entry point; loads commands, connects to MongoDB
deploy-commands.js    — One-off script to register slash commands with Discord
commands/
  cards/              — pull, eat, info
  economyowner/       — balance, daily, admin economy commands
  utility/            — copies, help, timers
models/
  user.js             — Mongoose schema for player data
data/
  cards.js            — Card definitions
```

## User preferences

- Always leave comments in code so a beginner can understand it.
- Bot replies should never ping the user (no @mention in prefix/slash command replies).
- Always favor backticks (`) over double-quotes (`"`) in bot messages.
- On normal messages that are not embeds, never end the message with a period.
- For all embeds using buttons, when those embeds expire the footer should update to "expired", clearing the original footer icon and text.
