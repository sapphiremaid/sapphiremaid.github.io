# House truth dashboard

Public-safe static cockpit for the House.

The UI reads `data.json` and intentionally exposes only coarse health facts. Never publish credentials, account identifiers, machine paths, process IDs, private repository details, private task text, or personal data here.

## Semantics

- `healthy`: the named user-visible postcondition was freshly proved.
- `degraded`: useful capability exists but part of the intended outcome is unproved or failing.
- `failed`: the postcondition was freshly proved false.
- `unknown`: no sufficiently fresh proof exists.
- `stale`: formerly proved state whose freshness window has expired.

The producer of `data.json` should obtain facts from the owning live system and decay stale facts rather than carrying old green state forward.
