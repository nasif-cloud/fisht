---
name: Profile progression
description: Shared XP, level, rank, and level-up reward rules
---

Player XP is awarded centrally through the level helper so all commands use the same progressive threshold curve and level-up reward behavior. The profile's global rank is ordered by total XP, which is equivalent to ordering by level and progress because the level thresholds are monotonic.

**Why:** Pull, manga, trivia, and daily commands all change the same progression system, so duplicating level calculations would risk mismatched ranks or missed rewards.

**How to apply:** Add future progression sources through the shared XP helper instead of modifying `User.xp` directly. Keep level-up Beli, reset-token, and optional DM behavior in that helper.