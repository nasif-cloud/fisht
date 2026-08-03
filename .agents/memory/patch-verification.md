---
name: Patch verification
description: A small-file editing lesson for workflow-critical syntax fixes
---

When a one-character syntax fix is required in a user-edited data file, verify the exact file contents with a direct read and `node --check` before restarting the workflow.

**Why:** A patch operation can report success while a very small replacement is not reflected in the file, leaving the workflow blocked by the original syntax error.

**How to apply:** After any tiny syntax repair, inspect the changed lines, run the file parser, then restart the workflow only after both checks pass.