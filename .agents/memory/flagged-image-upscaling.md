---
name: Universal card image sizing
description: Fixed-size card image normalization and cache behavior
---

Card images that are already within the small near-target tolerance can remain on their original URL. Other images use Sharp for a fast cubic cover resize to 573×800, cropping only the minimum excess rather than adding padding. In-flight/results are cached by source.

**Why:** Upscaling was unnecessary for this bot's card art and would add latency to Discord commands. Near-target sources do not need a visually indistinguishable replacement, while cover mode gives materially different sources the most zoomed-out full-canvas result.

**How to apply:** Route new card-rendering surfaces through the shared smart image result. Skip the Discord replacement when it reports `normalized: false`; missing or failed images should fall back to the original URL. Cover mode intentionally crops excess edges to prevent blank space.