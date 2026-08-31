function isoDate(timestamp: string): string {
  return new Date(timestamp).toISOString();
}

export function ratesHistoryKey(timestamp: string): string {
  return `rates_history:${isoDate(timestamp).slice(0, 13)}`;
}

export function forexHistoryKey(timestamp: string): string {
  return `forex_history:${isoDate(timestamp).slice(0, 10)}`;
}
