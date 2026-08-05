---
name: Card image command latency
description: Keeping Discord card commands responsive while maintaining fixed-size images
---

Card commands should prepare the final image payload before sending, then send or update Discord exactly once. Fixed 573×800 normalization is cached, and near-target images remain remote URLs without an attachment.

**Why:** Post-send attachment replacement causes a visible flash. Preparing before delivery removes that flash while cached and near-target images remain fast.

**How to apply:** Defer slash commands and component interactions before image work, then use `editReply`/one final payload. Do not issue a plain-image send followed by a normalization edit.