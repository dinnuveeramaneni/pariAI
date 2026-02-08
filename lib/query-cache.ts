import { sha256 } from "@/lib/util";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const QUERY_CACHE_TTL_MS = Number(process.env.QUERY_CACHE_TTL_MS ?? 30_000);
const queryCache = new Map<string, CacheEntry<unknown>>();

export function buildQueryCacheKey(
  namespace: "table" | "timeseries",
  orgId: string,
  payload: unknown,
): string {
  const hash = sha256(JSON.stringify(payload));
  return `${namespace}:${orgId}:${hash}`;
}

export function getCachedQuery<T>(key: string): T | null {
  const entry = queryCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setCachedQuery<T>(key: string, value: T): void {
  queryCache.set(key, {
    value,
    expiresAt: Date.now() + QUERY_CACHE_TTL_MS,
  });
}

export function resetQueryCacheForTests(): void {
  queryCache.clear();
}

export function clearQueryCacheForOrg(orgId: string): void {
  const tablePrefix = `table:${orgId}:`;
  const timeseriesPrefix = `timeseries:${orgId}:`;
  for (const key of queryCache.keys()) {
    if (key.startsWith(tablePrefix) || key.startsWith(timeseriesPrefix)) {
      queryCache.delete(key);
    }
  }
}
