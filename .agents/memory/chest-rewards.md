---
name: Chest rewards
description: Chest inventory storage, opening behavior, and reward tables
---

Chests are persistent inventory items and are shown first whenever the user has
one or more. The Basic Items inventory view includes Beli, Chests, Meat, Wine,
and Beer, while the Clones view contains only Clone ranks. Opening a chest spends it atomically and grants one independent
250–500 Beli roll, three independent consumable rolls, and three independent
Clone-rank rolls.

Consumable weights are Meat 40%, Wine 50%, and Beer 10%. Clone weights are D
60%, C 30%, B 8%, A 1.95%, and S 0.05%. Clone ranks are stored as separate
items and currently have no behavior beyond inventory display.

**Why:** Chest opening needs predictable per-chest rewards while preventing
concurrent opens from duplicating or losing inventory.

**How to apply:** Keep Chest consumption and all reward increments in the same
conditional MongoDB update. Preserve the existing rank emoji mapping when
displaying Clone items.