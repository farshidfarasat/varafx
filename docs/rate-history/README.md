# Rate history archive

Recovered and archived 2026-09-08 (FX/P&L audit, owner-ordered defect correction).

## Why this archive exists

- The KV key `rates_history` (namespace `bdc3b0f603f84a25958af622f0bf550b`, binding `KV`) holds 209 snapshots covering **2026-07-09 → 2026-08-31 only** — and it is **frozen**: nothing has appended to it since 2026-08-31T07:01Z.
- The **deployed** varafx worker (varafx.ops-091.workers.dev) runs different code than this repo: since 2026-08-31 it archives each history point as its own KV key (`rates_history:2026-08-31T10` … `rates_history:2026-09-08T14`, ~3–4/day, 47 keys total incl. `forex_history:YYYY-MM-DD` dailies) and `/api/history` serves the union of those keys. The repo's `handleScheduled` (single-array `rates_history`, cap 1500) no longer matches production.
- Deploying this repo as-is would re-attach the stale single-array path and orphan the per-snapshot archive. **Repo↔production drift must be reconciled before the next varafx deploy** (the deployed snapshot-per-key scheme is the better one — it is how September history survives).
- June 2026 market rates exist **nowhere** — the KV series starts 2026-07-09; per-snapshot keys start 2026-08-31. Unrecoverable from our systems (external Bonbast archive is the only possible source).

## Files

- `rates_history-kv-2026-09-08.json` — raw KV value of `rates_history` as read 2026-09-08 (~14:26 local) via `npx wrangler kv key get --namespace-id bdc3b0f603f84a25958af622f0bf550b rates_history` (owner wrangler OAuth; the standing `CLOUDFLARE_API_TOKEN` in varaledger/.dev.vars has no KV scope — 401).
- `toman-daily-2026-07-09_2026-08-31.json` — daily digest (last snapshot per UTC day) of the same series: USD/GBP/USDT buy+sell in Toman. This is the reference series used for the Jun–Aug 2026 FX-spread reconstruction (see `varaledger/docs/memory/learnings.md`, 2026-09-08 audit entry).

## Live sources (no token needed)

- `https://varafx.ops-091.workers.dev/api/rates` — live Toman buy/sell (Bonbast/AlanChand/Bitpin).
- `https://varafx.ops-091.workers.dev/api/history` — live snapshot-key history (currently 2026-08-31 → today).
- `https://varafx.ops-091.workers.dev/api/forex-history` — major pairs daily (Google FX, ~60 days).
