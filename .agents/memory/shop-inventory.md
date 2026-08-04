---
name: Shop inventory
description: Rules for adding and purchasing shop items
---

Shop entries are defined in one data file and the same entries generate the slash purchase choices. The shop display is a finished still image attached directly by the shop command. The current Meat purchase grants the user's `meat` resource, not `resetTokens`; purchases deduct Berries atomically while granting the configured inventory field.

**Why:** New shop items should not require separate renderer, command-choice, or purchase-logic edits, and concurrent purchases must not allow a player to overspend.

**How to apply:** Add a complete item entry to the shop data list, including its display name, aliases, price, inventory field, and grant amount. Update the still image separately when the visual inventory changes, and keep positive amount validation intact.

Economy purchases that decrement a non-negative schema field must use a native MongoDB update for the atomic `$inc`; Mongoose's non-negative setter can transform a negative increment into zero.

**Why:** A purchase previously granted Meat while leaving Berries unchanged because the schema setter sanitized the negative balance increment.

**How to apply:** Keep the balance predicate and item grant in the same native collection update, then re-fetch the user only for the confirmation message.