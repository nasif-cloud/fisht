---
name: Crate rewards
description: Crate drops, inventory storage, and Crate opening rewards
---

Successful Battle wins, rewarded Manga answers, and correct Trivia answers
each make one independent 10% Crate roll. Failed or timed-out minigames do not
roll for a Crate.

Crates are persistent inventory items. Opening them atomically consumes the
requested amount and grants one independent 1,000–2,500 Beli roll and one
independent 1–3 Gem roll per Crate. The Crate opening flow matches Chests,
including `all`, a three-second opening message, pluralized wording, and a
white result embed.

**Why:** Crates are a second container type with simpler rewards, but should
keep the same safe inventory and opening behavior as Chests.

**How to apply:** Keep Crate drops attached only to successful minigame reward
paths, and keep Crate consumption plus Beli/Gem increments in one conditional
MongoDB update.