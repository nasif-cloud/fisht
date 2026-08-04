---
name: Daily quests
description: Persistent quest assignment, progress, rewards, and reset notification rules
---

Daily quests are assigned independently per player at the shared 10:30 PM ET daily reset. Each player receives exactly three random quests from the configured pool; progress is persisted and claims are one-time.

**Why:** Quest progress must survive restarts and must not be identical for every player. Reset DMs for daily, pulls, and quests should be grouped when they happen at the same reset time to avoid notification spam.

**How to apply:** Route future questable actions through the shared quest progress helper, keep quest claims responsible for the 1,000 Beli/30 XP rewards and final 1 Meat bonus, and preserve the settings-controlled quest reset DM.