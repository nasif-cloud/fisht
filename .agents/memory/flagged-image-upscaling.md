---
name: Universal card image sizing
description: Fixed-size card image normalization and cache behavior
---

All card images use the same fixed 573×800 canvas output. The image pipeline uses Sharp for a Lanczos resize with aspect-ratio-preserving containment and caches in-flight/results by source so repeated card views and simultaneous requests do not redo downloads or processing.

**Why:** Upscaling was unnecessary for this bot's card art and would add latency to Discord commands; fixed-size normalization gives every card consistent dimensions without enlarging the source artwork.

**How to apply:** Route new card-rendering surfaces through the shared normalizer. Missing or failed images should still fall back to the original URL.