---
name: Player duel combat
description: Duel command uses saved teams of one to three cards, persistent active-session locks, role matchups, and timed private card selection
---

Duels use each player's saved one-to-three-card team with effective mastery, copy, and shiny stats. Cards receive one unique role each—HP, ATK, or SPD—then damage uses the cyclic 2x/1x/0.5x matchup table, logged as + / = / - for special, normal, and weak attacks. Requests expire after 60 seconds and card choices time out after 30 seconds; simultaneous final knockouts use speed, with equal speed producing a draw. Components V2 displays only the current/latest round log and serializes simultaneous picks before advancing.

**Why:** Duel state must be isolated per active player and must not reveal a player's selected card while preserving the existing team-stat rules.

**How to apply:** Keep duel UI and state in the combat command path, validate both teams before starting, score each stat within its card's rank range, use 2-point ATK buckets and 7-point HP buckets, then choose the best one-to-one HP/ATK/SPD assignment, keep one colored health-bar tick for any living card while leaving 0 HP empty, disable a player's entire choice row after selection, serialize both pick handlers before resolving a round, keep the requested separator/newline layout, show only the latest log, award the daily qualified reward only through the persisted reset/month/opponent/level checks, and release both active-player locks on every end state.