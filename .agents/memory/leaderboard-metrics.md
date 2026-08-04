---
name: Leaderboard metrics
description: Ranking definitions for the global leaderboard
---

The global leaderboard's team-power mode must calculate each saved team card with the same copy and shiny boosts used by the team renderer. Card mode counts total owned copies, level mode uses the shared XP-derived level, and Richest mode ranks by the user's current Berries balance.

**Why:** Players should see the same team power in their leaderboard rank that they see in `/team`; separate formulas would create confusing rankings.

**How to apply:** Reuse the existing card stat resolution and boost calculation when adding or changing team-power leaderboard behavior, and use `balance` for Berries-based rankings.