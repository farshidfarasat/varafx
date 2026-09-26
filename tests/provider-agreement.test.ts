/**
 * Provider-agreement guard: a plausible-but-wrong primary quote must not be
 * served as "live" when the secondary source disagrees wildly.
 *
 * Born 2026-09-25 from the dark-company audit's sharpest open FX gap: the
 * rate service labeled anything with a source name + fresh timestamp "live"
 * with no numeric cross-check — a mis-parsed or stale-but-plausible primary
 * would price real customer orders and land in the rate archive.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  providerAgreement,
  PROVIDER_DISAGREEMENT_CAP,
} from "../src/rate-selection";

test("identical primary and secondary agree", () => {
  const r = providerAgreement({ buy: 233000, sell: 233000 }, { buy: 233000, sell: 233000 });
  assert.equal(r.ok, true);
  assert.equal(r.deviation, 0);
});

test("normal inter-exchange spread stays within the cap", () => {
  const r = providerAgreement({ buy: 233000, sell: 233000 }, { buy: 236400, sell: 236500 });
  assert.ok(r.deviation! > 0 && r.deviation! < PROVIDER_DISAGREEMENT_CAP);
  assert.equal(r.ok, true);
});

test("a wildly wrong primary is caught by the secondary", () => {
  const r = providerAgreement({ buy: 232900, sell: 233000 }, { buy: 299500, sell: 300000 });
  assert.equal(r.ok, false);
  assert.ok(r.deviation! > PROVIDER_DISAGREEMENT_CAP);
});

test("a missing or zero secondary never blocks the primary", () => {
  assert.deepEqual(providerAgreement({ buy: 1, sell: 233000 }, null), { ok: true, deviation: null });
  assert.deepEqual(providerAgreement({ buy: 1, sell: 233000 }, { buy: 0, sell: 0 }), { ok: true, deviation: null });
});

test("the cap is a deliberate, documented value", () => {
  assert.equal(PROVIDER_DISAGREEMENT_CAP, 0.04);
});
