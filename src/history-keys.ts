function isoDate(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

export function ratesHistoryKey(timestamp: string): string {
  return `rates_history:${isoDate(timestamp).slice(0, 13)}`;
}

export function forexHistoryKey(timestamp: string): string {
  return `forex_history:${isoDate(timestamp).slice(0, 10)}`;
}


/**
 * Read a keyed history series COMPLETELY (cursor-paginated — KV list returns
 * at most 1000 keys per call and silently truncates at that bound, which
 * would freeze /api/history around the 1000th snapshot; FX triple-check
 * cure 2, 2026-11-17), newest-last, pruned to the serve cap.
 */
export async function readKeyedHistory(
  kv: { list(opts: { prefix: string; limit: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>; get(name: string, type: "json"): Promise<any>; delete(name: string): Promise<void> },
  prefix: string,
  legacyKey: string,
  maxEntries = 1500,
): Promise<any[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  // paginate until list_complete — the old single list(1000) silently
  // dropped every snapshot beyond the first page
  for (;;) {
    const listed = await kv.list({ prefix, limit: 1000, cursor });
    names.push(...listed.keys.map((k) => k.name));
    if (listed.list_complete) break;
    cursor = listed.cursor;
    if (!cursor) break; // defensive: a store without cursors stops here
  }
  const keyed = await Promise.all(names.map(async (name) => ({ name, value: await kv.get(name, "json") })));
  const history = keyed
    .filter((e): e is { name: string; value: Record<string, unknown> } => e.value !== null && typeof e.value === "object")
    .map((e) => ({ ...e }))
    .sort((a, b) => String(a.value.timestamp ?? a.value.date ?? a.name).localeCompare(String(b.value.timestamp ?? b.value.date ?? b.name)));
  // prune: keys beyond the serve cap are dead weight (bounded storage) —
  // delete the oldest surplus so the store cannot grow without bound
  const surplus = keyed.length - maxEntries;
  if (surplus > 0) {
    for (const e of history.slice(0, surplus)) {
      try { await kv.delete((e as { name: string }).name); } catch { /* deletion is best-effort */ }
    }
  }
  if (history.length === 0) {
    const legacy = await kv.get(legacyKey, "json");
    return Array.isArray(legacy) ? legacy : [];
  }
  return history.slice(-maxEntries).map((e) => e.value);
}