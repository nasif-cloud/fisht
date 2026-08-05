---
name: AI battle combat
description: Solo battle opponent selection, controls, rewards, and cooldown behavior
---

AI battles use a random real guild member's persisted team and avatar when that member's calculated level is within five levels of the player. The AI selects a random living card each round, while only the human player receives card-selection buttons.

**Why:** Solo battles should feel like the existing duel without requiring another active player, and using a saved in-range opponent keeps the match recognizable and level-appropriate.

**How to apply:** Keep the battle cooldown persisted on the player profile for 30 minutes, stamp it only after a valid opponent is found, use the shared duel combat math and renderer with the AI action row omitted, and award only a win with 10 XP and 200 Beli.