---
name: Team image decoding
description: Reliability rules for the canvas-rendered op team image
---

The team renderer must await every `loadImage` call, including cached buffers. Card art URLs should be selected from the owned mastery first, then fall back to the base card image; empty URLs should produce an empty slot rather than a rejected render.

**Why:** Canvas image decoding can reject asynchronously after the network fetch succeeds. Returning the unresolved promise from a renderer-level helper lets the rejection escape the command and prevents the team response from being sent.

**How to apply:** Keep image fetch/decode failures inside the per-card helper, cache failed URLs as null, and let the rest of the team render with a placeholder slot. Role badges and other auxiliary images should follow the same cached, failure-safe pattern.