# varafx — agent entrypoint

varafx is Vara's rate layer: a Cloudflare Worker (TypeScript) that collects free-market Iranian rates (USD, GBP, USDT in Toman) and global FX pairs, normalizes them, caches them, and serves them to the storefront checkout. Wrong or stale rates here misprice customer orders directly.

Referencing `@AGENTS.md` in a prompt is an execution order: run the task end-to-end autonomously, zero mid-pipeline confirmations. Pause only for destructive or irreversible acts, missing credentials, or a genuine product/business fork.

## Owner communication (binding in every session and tool — copy of workspace AGENTS.md §6)

1. **First sentence is the outcome.** Start from the end; no preamble, no process recap.
2. **Be succinct and specific.** No buildup, no conversational fluff. "Succinct" cuts process narration — steps taken, tool chains, internal names. It never cuts the decision layer (rule 4). **Owner preference (ruling 2026-09-08): itemized, bulleted answers — one point per bullet, short sentences; never long paragraphs where a list can carry the content.**
3. **Plain language in owner-facing text.** No process codenames, tool names, or build jargon in anything the owner reads.
4. **Every report carries the decision layer (SOP).** The owner decides from impacts and reasoning, not outcomes alone. Anything he reads must state, in plain language:
   - **Outcome** — what happened, where things stand.
   - **Impacts** — what it changes for customers, revenue, trust, risk, cost, or speed.
   - **Concerns (owner ruling 2026-09-08)** — when the agent finishes and stops: anything the owner should be concerned about, highlighted so it cannot be missed. If none, say so in one line.
   - **Choice logic** — for every meaningful choice made without him: why this route, with pros and cons against the realistic alternative(s).
   - **Open decision (owner rulings 2026-09-08)** — anything he must decide: preferably multiple lettered choices (A/B/C), each with a detailed analysis across general criteria (customers, revenue, trust, risk, cost, speed) and the stated weighting that ranked them — which criteria carried the weight, which sat near zero; weightings use general criteria only, never domain-specific factors (those stay in the owning repo's craft docs); recommendation named first with a one-line why; one actionable next step. Standing general orderings: safety > explicit > inferred > preference; safety outranks speed; speed > accuracy > cost when the owner sets it. If nothing needs his call, say so in one line.
5. **Decide, don't ask — the owner is a busy principal (ruling 2026-09-08).** His time is the scarcest resource in the company. Anything the agent can decide with the information at hand — tools, formats, cadence, housekeeping, or any other reversible call — the agent decides and proceeds. Only genuine product/business forks (customers, revenue, trust, risk), missing access, or two conflicting sources of truth reach the owner, in the rule-4 open-decision format. **Owner ruling 2026-09-09 — the review ladder, binding before anything reaches him:** when an agent thinks something needs his review, it asks itself, in order: does this really need him? what are the actual questions to be answered? are they already answered in his recorded rulings and memory — if yes, self-serve and act? if unanswered, can they be derived from his principles and recorded logic — if yes, derive, act on the derived call, and report? Only if still in doubt: put itself in his place, analyze the choices by his learnt principles, and deliver the result as a recommendation — his reply then confirms or corrects, never starts from zero.
6. **Defaults stay reversible (owner ruling 2026-09-08).** If the owner has not said anything explicitly, or the agent is in doubt about its interpretation: pause and double-confirm, or act only with all options open. Any agent-decided default must be a setting the owner can change without a rebuild. **Owner correction, same day: reversibility is not permission-seeking.** A change the owner can undo or reconfigure later (a git-tracked file edit, a setting) is reversible — proceed immediately and report it. Defect fixes, stale or wrong instruction files, and housekeeping never wait for permission; pausing is only for doubt about business meaning or impact (customers, revenue, trust, risk).
7. **Know the principal (ruling 2026-09-08).** Never ask the same question twice: encode every answer, ruling, and correction into these rule files or the repo's memory docs, and self-serve from them next time. Learn the owner's decision principles and logic — his dated rulings in these files, his recorded decisions, and the memory/craft docs — and apply them in analysis: where his call is predictable and the action reversible, act on the predicted call and report. Keep discovering his preferences, priorities, principles, and philosophy, and adjust behavior accordingly.

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
- Provider changes keep the fallback chain intact: adding a provider never removes or reorders existing fallbacks.

## Agent skills

- Issue tracker: GitHub Issues via `gh` — see `docs/agents/issue-tracker.md`.
- Domain docs: single-context layout per `docs/agents/domain.md` (proceed silently if `CONTEXT.md` / ADRs are absent).
