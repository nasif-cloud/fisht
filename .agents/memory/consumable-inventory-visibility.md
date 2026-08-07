---
name: Consumable inventory visibility
description: Rules for showing inventory items and spending Wine or Beer
---

Zero-count inventory items should not be rendered in the inventory list. If all
tracked items are empty, show an explicit empty-inventory state instead.

Wine and Beer are cooldown-reset consumables, not general-purpose items. Wine
may only be spent while the battle cooldown is active, and Beer may only be
spent while the daily duel-reward cooldown is active. The availability check
must be included in the atomic spend update as well as the initial user-facing
check.

**Why:** Spending a reset item while the associated action is already ready
wastes the player's item and makes inventory counts misleading.

**How to apply:** When adding or changing consumable commands, reuse the exact
cooldown readiness boundary from the action they reset and require both an item
count and an active cooldown in the database mutation.