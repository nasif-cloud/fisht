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
| `GUILD_ID` | Server ID to register slash commands to (for instant testing) |
| `MONGODB_URI` | MongoDB Atlas connection string |

## Deploying slash commands

Run this once after adding or changing commands:

```
node deploy-commands.js
```

This registers slash commands to the server in `GUILD_ID`. To register globally (takes up to an hour), edit `deploy-commands.js` and switch to Option B.

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
