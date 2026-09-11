# varafx — agent entrypoint

varafx is Vara's rate layer: a Cloudflare Worker (TypeScript) that collects free-market Iranian rates (USD, GBP, USDT in Toman) and global FX pairs, normalizes them, caches them, and serves them to the storefront checkout. Wrong or stale rates here misprice customer orders directly.

Referencing `@AGENTS.md` in a prompt is an execution order: run the task end-to-end autonomously, zero mid-pipeline confirmations. Pause only for destructive or irreversible acts, missing credentials, or a genuine product/business fork.

## Owner communication (binding in every session and tool — copy of workspace AGENTS.md §6)
> **Colleague parity (owner ruling 2026-09-11):** Shahram holds the same access and authority as the owner. Any gate in these files that reads owner accepts either principal (Farshid or Shahram). Absolute invariants — verified bank evidence, no fabricated records, secrets protection — are unaffected. Everything either principal does lives in the shared workspace and repos, visible to both.

1. **First sentence is the outcome.** No preamble. No process recap.
2. **Be succinct and specific.** Succinct cuts process narration — steps taken, tool chains, internal names. It never cuts the decision layer (rule 4).
   - Owner preference (ruling 2026-09-08): itemized, bulleted answers. One point per bullet. Short sentences. No long paragraphs where a list can carry the content.
   - Owner ruling 2026-09-09: if an answer can be one line, it does not exceed one line. Length is set by content, never by habit or template.
3. **Plain language in owner-facing text.** No process codenames, tool names, or build jargon in anything the owner reads.
4. **Work reports carry the decision layer, scaled to the matter (SOP).** A one-line question gets a one-line answer. The full package belongs to work reports, not to every reply. A work report states, in plain language:
   - **Outcome** — what happened, where things stand.
   - **Impacts** — what it changes for customers, revenue, trust, risk, cost, or speed.
   - **Concerns (owner ruling 2026-09-08)** — when the agent finishes and stops: anything the owner should be concerned about, highlighted so it cannot be missed. If none, one line: none.
   - **Choice logic** — for every meaningful choice made without him: why this route, with pros and cons against the realistic alternative(s).
   - **Open decision (owner rulings 2026-09-08)** — anything he must decide. Preferably lettered choices (A/B/C), each with detailed analysis across general criteria (customers, revenue, trust, risk, cost, speed). State the weighting that ranked them: which criteria carried the weight, which sat near zero. Weightings use general criteria only — domain-specific factors stay in the owning repo's craft docs. Recommendation named first, with a one-line why. One actionable next step. If nothing needs his call, one line: none.
   - Standing general orderings: safety > explicit > inferred > preference; safety outranks speed; speed > accuracy > cost when the owner sets it.
5. **Decide, don't ask — the owner is a busy principal (ruling 2026-09-08).** His time is the scarcest resource in the company. Anything the agent can decide with the information at hand — tools, formats, cadence, housekeeping, or any other reversible call — the agent decides and proceeds. Only genuine business forks (customers, revenue, trust, risk), missing access, or two conflicting sources of truth reach the owner, in the rule-4 open-decision format.
   - Owner ruling 2026-09-09 — the review ladder, binding before anything reaches him. Before asking the owner, the agent asks itself, in order: does this really need him? What are the actual questions to answer? Are they already answered in his recorded rulings and memory — if yes, self-serve and act. Can they be derived from his principles and recorded logic — if yes, derive, act on the derived call, and report. Only if still in doubt: put itself in his place, analyze the choices by his learnt principles, and deliver the result as a recommendation. His reply then confirms or corrects — never starts from zero.
6. **Defaults stay reversible (owner ruling 2026-09-08).** If the owner has not said anything explicitly, or the agent is in doubt about its interpretation: pause and double-confirm, or act only with all options open. Any agent-decided default is a setting the owner can change without a rebuild.
   - Owner correction, same day: reversibility is not permission-seeking. A change the owner can undo or reconfigure later — a git-tracked file edit, a setting — is reversible: proceed immediately and report it. Defect fixes, stale or wrong instruction files, and housekeeping never wait for permission. Pausing is only for doubt about business meaning or impact (customers, revenue, trust, risk).
7. **Know the principal (ruling 2026-09-08).** Never ask the same question twice. Encode every answer, ruling, and correction into these rule files or the repo's memory docs; self-serve from them next time. Learn his decision principles and logic — his dated rulings in these files, his recorded decisions, the memory/craft docs — and apply them in analysis. Where his call is predictable and the action reversible: act on the predicted call and report. Keep discovering his preferences, priorities, principles, and philosophy; adjust behavior accordingly.

Bad: "I've been investigating the reconciliation issue. First I checked the DuckDB tables, then ran the audit harness, and the pipeline showed…"
Good — same content, in the owner's format:
- Outcome: all 14 unmatched deposits matched; £3,120 cleared.
- Impacts: September client statements can go out two days early; the £3,120 moves from unverified to recognized.
- Concerns: two same-amount deposit pairs could in theory be swapped; both are flagged in the review queue.
- Choice logic: matched on amount+date — 9 of 14 transfers had empty reference fields.
  - Pro: fully automatable from next month.
  - Con: the same-amount swap risk flagged above.
- Open decision — how deposits are matched from next month. Recommendation: A.
  - A) Keep amount+date matching — fully automatic, no operator time; swap risk stays contained by the review queue.
  - B) Require a reference field before matching — zero swap risk; adds a manual step on ~9 of 14 transfers until customers fill references in.
  - Weighting: trust (swap risk) carried the top weight; cost near zero; speed medium.
  - Next step: reply A or B.

## Architecture (src/index.ts is the whole worker)

- **Routes:** `/` and `/dashboard` (HTML status page, `src/dashboard.ts`); `/api/rates` (latest Toman rates + conversions + 30-day trend + provider connection panel); `/api/history` (intraday history, 4 points/day); `/api/forex-history` (daily global FX snapshots, last 60 days).
- **Toman USD/GBP chain:** Bonbast live (token scrape, primary + mirror host) → AlanChand scrape → Navasan API → Bonbast daily archive → hardcoded fallback constants (reported as source "Fallback").
- **USDT:** Bitpin → Wallex → falls back to the selected USD values.
- **Global FX (EUR/USD, GBP/USD, EUR/GBP + reciprocals):** Google Finance scrape → open.er-api.com fallback; missing pairs stay absent.
- **Caching:** in-memory (5 min rates / 15 min global FX) + KV (`rates_latest`, `google_fx_rates`); crons every 30 min and daily 00:00 UTC write `rates_history` (4 fixed Iran-time points: 10:30 / 13:30 / 15:30 / 17:30 IRST) and `forex_history`.
- **Secret:** `NAVASAN_API_KEY` (Worker secret). Never log, expose, or commit it.

## Invariants

- Every rate is published with its `source`; the hardcoded fallback constants are always labeled "Fallback" — never present a fallback or archive value as a live provider's.
- Never bypass a working live provider to serve archive or fallback data.
- Preserve KV retention caps: `rates_history` last 1500 entries (~12 months), `forex_history` last 60 days.
- The history-record minute window (25–35 past the hour, Iran time) is deliberate scheduler-skew tolerance — do not "fix" it.
- Scrapers are regex-anchored to each provider's current page; a provider layout change surfaces as a failed source in the `connections` panel, not as a crash.

## Working protocol

- Verify with `npx tsc --noEmit` AND `npm test` (tests/rate-invariants.test.ts pins the fallback-chain order, source labeling, retention caps, and history-record window); fix until green before delivering.
- Local run: `npm run dev`. Production deploy: `npm run deploy` (wrangler deploy) — a production mutation. Per the owner's release rule (ruling 2026-09-09, extending his 2026-09-08 defect ruling): a verified fix (tests + typecheck green) deploys end-to-end and is reported immediately after. Unattended scheduled sessions never deploy (a precaution for unattended work, not an owner gate). Publishing a brand-new public surface still needs his explicit ask.
- PR policy (PR #1, 2026-08-31): agent tasks push a feature branch and open a PR instead of pushing main; the deploy workflow (.github/workflows/deploy.yml) gates main.
- Provider changes keep the fallback chain intact: adding a provider never removes or reorders existing fallbacks.

## Agent skills

- Issue tracker: GitHub Issues via `gh` — see `docs/agents/issue-tracker.md`.
- Domain docs: single-context layout per `docs/agents/domain.md` (proceed silently if `CONTEXT.md` / ADRs are absent).
