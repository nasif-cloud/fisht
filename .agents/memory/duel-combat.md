---
name: Player duel combat
description: Duel command uses saved three-card teams, persistent active-session locks, role matchups, and timed private card selection
---

Duels use each player's saved three-card team with effective mastery, copy, and shiny stats. Cards receive one unique role each—HP, ATK, or SPD—then damage uses the cyclic 2x/1x/0.5x matchup table. Requests and card choices time out after 30 seconds; simultaneous final knockouts use speed, with equal speed producing a draw.

**Why:** Duel state must be isolated per active player and must not reveal a player's selected card while preserving the existing team-stat rules.

**How to apply:** Keep duel UI and state in the combat command path, validate both teams before starting, disable a player's entire choice row after selection, and release both active-player locks on every end state.