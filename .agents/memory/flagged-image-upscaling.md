---
name: Flagged image upscaling
description: Fast opt-in card image upscaling and cache behavior
---

Cards opt into upscaling with `isUpscale: true`. The image pipeline uses Sharp for a 2× Lanczos resize and caches in-flight/results by source so repeated card views and simultaneous requests do not redo downloads or processing.

**Why:** AI upscaling was unnecessary for this bot's card art and would add latency to Discord commands; fast deterministic resizing is sufficient when the user explicitly flags an image.

**How to apply:** Preserve the opt-in flag and shared cache when adding new card-rendering surfaces. Unflagged cards should continue using their original URL, and upscale failures should fall back to that URL.