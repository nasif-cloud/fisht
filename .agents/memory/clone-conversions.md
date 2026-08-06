---
name: Clone conversions
description: Prefix conversion rules for Clone items, card copies, Gems, and Beli
---

`op convert [rank] [amount|all] [card]` converts same-rank Clone inventory into
copies of a matching-rank card. `op convert [amount|all]` converts Gems into
Beli at 1,000 Beli per Gem. Amount defaults to 1, and `all` uses the owned
source amount.

The source inventory decrement and destination update must happen atomically.
Clone conversion must compare the Clone rank to the card's base rank, not a
mastery rank. Owner item grants accept the rank aliases used by inventory
items, including `D`, `cloneD`, and `D Clone`.

**Why:** Clones are rank-specific conversion material, so allowing a different
card rank would bypass the intended economy balance.

**How to apply:** Preserve exact same-rank validation and conditional MongoDB
updates when adding conversion targets or changing card-copy storage.