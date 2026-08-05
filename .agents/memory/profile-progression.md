---
name: Profile progression
description: Shared XP, level, rank, and level-up reward rules
---

Player XP is awarded centrally through the level helper. The XP needed for each next level is linear: 150 XP for level 1 → 2, then +5 XP per level (155 for 2 → 3, 160 for 3 → 4). The profile's global rank is ordered by total XP.

**Why:** Pull, manga, trivia, and daily commands all change the same progression system, so duplicating level calculations would risk mismatched ranks or missed rewards. The cumulative requirement to reach level 3 is 305 XP.

**How to apply:** Add future progression sources through the shared XP helper instead of modifying `User.xp` directly. Keep level-up Beli and reset-token rewards in that helper, and route the resulting level-up notice to the originating channel by default or to DMs when the user's delivery setting is enabled.