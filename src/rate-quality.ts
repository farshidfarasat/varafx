export type RateQuality = "live" | "degraded" | "unavailable";

export interface RateObservation {
  source: string | null;
  observed_at: string | null;
}

const DEFAULT_MAX_AGE_MS = 35 * 60 * 1000;

export function classifyRateQuality(
  observation: RateObservation,
  now = Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): RateQuality {
  if (!observation.source || !observation.observed_at) return "unavailable";

  const observedAt = Date.parse(observation.observed_at);
  if (!Number.isFinite(observedAt) || now - observedAt > maxAgeMs) {
    return "unavailable";
  }

  const source = observation.source.toLowerCase();
  if (
    source.includes("fallback") ||
    source.includes("archive") ||
    source.includes("stale")
  ) {
    return "degraded";
  }

  return "live";
}
