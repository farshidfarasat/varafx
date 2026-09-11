import test from "node:test";
import assert from "node:assert/strict";
import { classifyRateQuality } from "../src/rate-quality";
import { forexHistoryKey, ratesHistoryKey } from "../src/history-keys";
import { dashboardHtml } from "../src/dashboard";

test("live source with fresh observation is live", () => {
  const now = Date.parse("2026-08-31T06:00:00.000Z");
  assert.equal(
    classifyRateQuality(
      { source: "Google Finance", observed_at: "2026-08-31T05:59:00.000Z" },
      now,
    ),
    "live",
  );
});

test("fallback source is degraded even when fresh", () => {
  const now = Date.parse("2026-08-31T06:00:00.000Z");
  assert.equal(
    classifyRateQuality(
      { source: "Fallback API", observed_at: "2026-08-31T05:59:00.000Z" },
      now,
    ),
    "degraded",
  );
});

test("missing or stale observation is unavailable", () => {
  const now = Date.parse("2026-08-31T06:00:00.000Z");
  assert.equal(
    classifyRateQuality({ source: "Google Finance", observed_at: null }, now),
    "unavailable",
  );
  assert.equal(
    classifyRateQuality(
      { source: "Google Finance", observed_at: "2026-08-30T00:00:00.000Z" },
      now,
    ),
    "unavailable",
  );
});

test("history keys are deterministic for retry-safe snapshots", () => {
  assert.equal(
    ratesHistoryKey("2026-08-31T07:30:42.000Z"),
    "rates_history:2026-08-31T07",
  );
  assert.equal(
    forexHistoryKey("2026-08-31T07:30:42.000Z"),
    "forex_history:2026-08-31",
  );
});

test("dashboard exposes the API quality state", () => {
  assert.match(dashboardHtml, /id="badge-live"/);
  assert.match(dashboardHtml, /apiData\?\.quality/);
});
