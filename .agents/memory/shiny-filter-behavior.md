---
name: Shiny filter behavior
description: Product rule for shiny filtering and pagination in card browsing commands
---

When the shiny filter is enabled, the command must build its entire browse, search, sort, and pagination state from only the user's shiny-owned card entries. The Next button must be disabled using that filtered list's length, so it cannot advance into normal cards.

**Why:** A prior implementation filtered only the initial view and later rebuilt pages from the complete collection/catalog, causing a user with one shiny card to see non-shiny cards after pressing Next.

**How to apply:** Keep the unfiltered list as the default. Toggle a boolean filter state, derive a filtered list from it, and pass that filtered list to every sort, search, navigation, and button-state calculation.