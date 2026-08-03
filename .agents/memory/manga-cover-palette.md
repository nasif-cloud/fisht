---
name: Manga cover palette
description: Dominant-color processing for the manga challenge cover assets
---

The manga challenge uses `node-vibrant` on downloaded image buffers rather than a format-specific parser. The highest-population palette swatch drives both the Discord embed color and the clean solid-color mask over the volume number while the challenge is active.

**Why:** The gallery contains both JPEG and PNG covers, and the active image must hide the volume number without an ugly blur while the completed state needs to restore the original cover.

**How to apply:** Keep the palette, clean cover, and masked cover together in the same cache entry so all challenge states use the same downloaded image and dominant color.