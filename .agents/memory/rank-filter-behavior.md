---
name: Slash rank filters
description: Rank filters on allcards and collection are slash-only and constrain the source list before search, sorting, and pagination
---

Rank filtering is available as a slash-only option on both `allcards` and `collection`, with the choices UR, SS, S, A, B, C, and D. On `allcards`, shiny filtering is not supported; on `collection`, the existing shiny behavior remains and combines with rank filtering.

**Why:** The catalog and collection browsers need consistent filtered navigation while keeping prefix controls simple and preserving collection’s established shiny workflow.

**How to apply:** Add new catalog filters to the source-list predicate before search and sorting. Keep `card` search mutually exclusive with `sort`, `mastery`, or `rank` where those options are present.