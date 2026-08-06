---
name: Persistent channel card drops
description: Channel drops use persistent teaser and claim states with atomic MongoDB reservations and claims
---

Channel drops must remain recoverable across bot restarts and safe when multiple bot instances are online. Persist the channel reservation and drop state in MongoDB; reserve the channel with a conditional update before sending the charge message, transition charging to pending atomically after the charge window, and claim with a conditional pending-status update inside the user-save transaction.

The charge message is sent immediately with one blue charge button and a disabled grey count button. Each user can charge once per drop; the final card/rank is selected only after the one-minute charge window, and the full claim window starts at activation. Charge and claim buttons must be acknowledged before database work to stay within Discord's interaction timeout.

**Why:** Scheduler polling, image processing, database latency, and deployments can all occur between Discord messages. In-memory timers or late button acknowledgements can create duplicate drops, shortened claim windows, or failed-looking interactions.

**How to apply:** Any future drop changes must preserve the persisted teaser/pending/claimed/expired lifecycle, restart recovery for pending records without a message ID, and atomic first-claim behavior.