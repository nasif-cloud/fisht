# fisht

Discord fishing bot scaffold built with Discord.js v14.

## Project Layout

```text
fisht/
├─ src/
│  ├─ commands/
│  │  ├─ fish.js
│  │  ├─ inventory.js
│  │  └─ settings.js
│  ├─ handlers/
│  │  └─ commandLoader.js
│  ├─ lib/
│  │  ├─ database.js
│  │  ├─ fishData.js
│  │  └─ fishing.js
│  ├─ config.js
│  └─ index.js
├─ .env.example
├─ .gitignore
└─ package.json
```

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and fill in your bot token, application IDs, and MongoDB connection string.
3. Start the bot with `npm start`.

## Editing Notes

- All user-facing embeds and button definitions live directly inside the command files.
- The database uses MongoDB and stores each user in a `users` collection.
- Slash commands and prefix commands share the same command modules, so edits only need to happen once.

## Environment Variables

- `BOT_TOKEN` is your Discord bot token.
- `CLIENT_ID` is your Discord application client ID.
- `GUILD_ID` is optional and limits slash command registration to one server.
- `MONGODB_URI` is the MongoDB connection string.
- `MONGODB_DB` is the database name to use. If you skip it, the bot defaults to `fisht`.

## Default Prefix

The bot starts with `?`.
Users can replace it with a custom prefix from `/settings`.