---
name: Portable npm lockfiles
description: Keeping npm dependency metadata deployable outside Replit
---

`package-lock.json` can contain Replit Package Firewall tarball URLs that only resolve inside Replit. External deploy providers such as Render need public `registry.npmjs.org` URLs.

**Why:** A lockfile generated through Replit can otherwise make `npm ci` fail before the app starts with `ENOTFOUND package-firewall.replit.local`.

**How to apply:** Before external deployment, scan the lockfile for `package-firewall.replit.local` and replace package tarball hosts with `https://registry.npmjs.org/`; validate using `npm ci --dry-run --registry=https://registry.npmjs.org`.