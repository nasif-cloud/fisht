---
name: Attachment embed preservation
description: Discord embed edits that preserve uploaded card images
---

When a card embed references an uploaded Discord attachment, expiry or cleanup edits must update only components. Rebuilding the embeds payload can detach the image and render it below the embed.

**Why:** Discord can treat attachment files as unreferenced when an embed is rewritten, even if the replacement embed appears visually equivalent.

**How to apply:** Before editing a card message at collector expiry, inspect the latest embed image URL. If it contains a Discord attachment URL, remove controls without sending a replacement embeds payload; only external-image embeds may safely receive footer updates.