---
name: Flagged image upscaling
description: Fast opt-in card image upscaling and cache behavior
---

All card images use the same fixed 2× canvas output. The image pipeline uses Sharp for a Lanczos resize with aspect-ratio-preserving containment and caches in-flight/results by source so repeated card views and simultaneous requests do not redo downloads or processing.

**Why:** AI upscaling was unnecessary for this bot's card art and would add latency to Discord commands; fast deterministic resizing gives every card a consistent 1146×1600 output.

**How to apply:** Route new card-rendering surfaces through the shared normalizer. Missing or failed images should still fall back to the original URL.