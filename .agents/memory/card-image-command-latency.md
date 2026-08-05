---
name: Card image command latency
description: Keeping Discord card commands responsive while maintaining fixed-size images
---

Card commands should send the original remote image immediately. Fixed 573×800 normalization runs asynchronously afterward, with shared in-flight/result caching for later views.

**Why:** Remote downloads and image conversion can add hundreds of milliseconds or more to the response path, while Discord can display the original card immediately.

**How to apply:** Keep background replacement guarded against stale navigation state. Do not await normalization before the initial pull, card view, catalog, info, or collection response.