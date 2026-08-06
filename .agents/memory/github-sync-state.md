---
name: GitHub sync state
description: How to verify repository state after a managed GitHub pull reports a conflict
---

The managed GitHub pull can report `MERGE_CONFLICT` even when no conflict markers or unmerged index entries remain. Trust the actual repository state: check `git status`, `git ls-files -u`, and whether `origin/main` is an ancestor of `HEAD` before attempting manual conflict resolution.

**Why:** A false-positive pull result can lead to unnecessary resets or loss of local commits when the remote is already fully contained in the local branch.

**How to apply:** Preserve a clean working tree, verify ancestry, inspect the commit delta, and only reapply requested changes that are genuinely absent.