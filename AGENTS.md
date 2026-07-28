# AGENTS.md — Autonomous Single-Prompt Protocol

Referencing `@AGENTS.md` in a prompt is an execution order. The agent MUST run the complete end-to-end pipeline autonomously — zero manual steps, zero confirmation prompts between steps.

## Execution Pipeline

1. **Pull Latest State**: Run `git pull origin main` before editing.
2. **Implementation**:
   - Fetch FX rates from Google Finance (`https://www.google.com/finance/quote/{FROM}-{TO}`).
   - Add pairs: `EUR/USD`, `GBP/USD`, `EUR/GBP` and reciprocals `USD/EUR`, `USD/GBP`, `GBP/EUR`.
   - Update `src/index.ts` and `src/dashboard.ts` to output and render all 6 rates cleanly.
3. **Verification**: Run `npm test` or typecheck (`npx tsc --noEmit`). Fix errors automatically until green.
4. **Sync & Push**: `git add .`, commit with `feat: add Google FX rates for EUR/USD, GBP/USD, EUR/GBP and reverses`, and `git push origin main`.
5. **Summary**: Provide a final summary of changes, commit SHA, and test results.
