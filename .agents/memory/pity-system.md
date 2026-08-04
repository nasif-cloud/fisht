---
name: Persistent pity system
description: Independent S, SS, and UR pity counters advance on successful pulls and persist through daily pull-window resets
---

Pity thresholds are S 250, SS 800, and UR 2500. Each tier has its own persistent counter; daily `pullsUsed` resets do not affect pity. The highest eligible guarantee wins, lower-tier counters reset with that guarantee, and higher-tier progress is preserved. Pity uses the quest bar artwork with nine segments.

**Why:** Separate owner-settable rank progress makes each displayed pity bar meaningful while preventing frequent S guarantees from blocking eventual SS and UR guarantees.

**How to apply:** Advance pity only after a card pool is successfully selected and saved. Keep guarantee messaging after the card result, and do not silently fall back to another rank when a guaranteed rank has no pullable cards.