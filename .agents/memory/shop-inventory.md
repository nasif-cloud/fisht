---
name: Shop inventory
description: Rules for adding and purchasing shop items
---

Shop entries are defined in one data file. Their order controls image slot placement and the same entries generate the slash purchase choices. Purchases deduct Berries atomically while granting the configured inventory field.

**Why:** New shop items should not require separate renderer, command-choice, or purchase-logic edits, and concurrent purchases must not allow a player to overspend.

**How to apply:** Add a complete item entry to the shop data list, including its display name, aliases, price, inventory field, grant amount, and emoji metadata. Keep the four-slot image order and positive amount validation intact.