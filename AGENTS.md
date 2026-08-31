# AGENTS.md — Autonomous Single-Prompt Protocol

Referencing `@AGENTS.md` in a prompt is an execution order. The agent MUST run the complete end-to-end pipeline autonomously — zero manual steps, zero confirmation prompts between steps.

## Execution Pipeline

1. **Pull Latest State**: Run `git pull origin main` before editing.
2. **Implementation**:
   - Fetch FX rates from Google Finance (`https://www.google.com/finance/quote/{FROM}-{TO}`).
   - Add pairs: `EUR/USD`, `GBP/USD`, `EUR/GBP` and reciprocals `USD/EUR`, `USD/GBP`, `GBP/EUR`.
   - Update `src/index.ts` and `src/dashboard.ts` to output and render all 6 rates cleanly.
3. **Verification**: Run `npm test` or typecheck (`npx tsc --noEmit`). Fix errors automatically until green.
4. **Sync & Push**: `git add .`, commit with a concise semantic message, push the active feature branch, and open or update a PR. Never push directly to `main`, merge a PR, or publish a production mutation from an agent task.
5. **Summary**: Provide a final summary of changes, commit SHA, and test results.

## Agent skills

### Issue tracker

GitHub Issues via `gh` (this repo's origin). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout. See `docs/agents/domain.md`. Skills proceed silently if `CONTEXT.md` / ADRs are absent.

