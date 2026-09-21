# House truth dashboard

Public GitHub Pages shell for Katherine's House dashboard.

The public repository contains **UI only**. It does not contain House snapshots, credentials, machine paths, task text, account identifiers, or a cached "last known" operational state.

At runtime, the page reads the loopback-only House truth bridge at `http://127.0.0.1:43117/v2/dashboard`. The bridge is bound to localhost and permits browser reads only from the exact Pages origin `https://sapphiremaid.github.io`.

## Truth contract

- A numeric zero may be shown only after the named live owner was successfully observed and returned an empty set/count.
- Missing or failed evidence is not coerced to zero.
- Stale evidence is not presented as current.
- Derived states are labeled derived.
- Unknown project/domain state stays Unknown.
- If the local truth feed fails, the UI clears current values instead of displaying cached values as current.
- The Proof view exposes source, observation time, freshness window, blind spots, and the raw current receipt.

Canonical collector and UI source live in the private `sapphiremaid/house-cockpit` repository. This public directory is only the deployable static shell.
