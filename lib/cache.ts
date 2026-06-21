import { cacheBypassRefresh, runtimeEnv } from "@/lib/runtime-env";

const MOVIE_LIST_METADATA_CACHE_VERSION = "img-fields-v2";

const DETAIL_TTL_SECONDS = 60 * 60 * 24 * 90;
const LIST_TTL_SECONDS = 60 * 30;
const SEARCH_TTL_SECONDS = 0;
const ERROR_TTL_SECONDS = 60;

type MinimalKvNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; metadata?: Record<string, string> }>;
    list_complete: boolean;
    cursor?: string;
  }>;
};

type CacheEnv = {
  KV?: MinimalKvNamespace;
  MOVIE_METADATA?: MinimalKvNamespace;
};

type JsonEnvelope<T> = {
  cachedAt: string;
  sourceUrl?: string;
  hash?: string;
  value: T;
};

export type JsonCacheEntry<T> = {
  value: T;
  cachedAt?: string;
  hash?: string;
};

export type KvWriteBudget = {
  softLimit: number;
  hardLimit: number;
};

export type KvWriteBudgetSnapshot = {
  daily_write_count: number;
  kv_writes: number;
  kv_skipped_unchanged: number;
  refresh_stopped_by_soft_limit: boolean;
  refresh_stopped_by_hard_limit: boolean;
};

type KvWriteBudgetState = KvWriteBudget & {
  key: string;
  initialCount: number;
  writes: number;
  skippedUnchanged: number;
  stoppedBySoftLimit: boolean;
  stoppedByHardLimit: boolean;
  kv?: MinimalKvNamespace;
};

type WriteJsonCacheOptions = {
  critical?: boolean;
  hashValue?: unknown;
};

let currentKvWriteBudget: KvWriteBudgetState | undefined;
const lastKvWriteSecond = new Map<string, number>();

function env() {
  return runtimeEnv<CacheEnv>() || {};
}

function metadataKv() {
  return env().MOVIE_METADATA || env().KV;
}

function cacheLog(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

export function logCacheEvent(message: string, details?: Record<string, unknown>) {
  cacheLog(message, details);
}

export function detailCacheTtlSeconds() {
  return DETAIL_TTL_SECONDS;
}

export function taxonomyCacheTtlSeconds() {
  return LIST_TTL_SECONDS;
}

export function listCacheTtlSeconds() {
  return LIST_TTL_SECONDS;
}

export function searchCacheTtlSeconds() {
  return SEARCH_TTL_SECONDS;
}

export function errorCacheTtlSeconds() {
  return ERROR_TTL_SECONDS;
}

export function isCacheEntryFresh(cachedAt: string | undefined, ttlSeconds: number) {
  const time = cachedAt ? Date.parse(cachedAt) : 0;
  return Number.isFinite(time) && Date.now() - time <= ttlSeconds * 1000;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

async function stableHash(value: unknown) {
  return sha256(stableJson(value));
}

function dailyKvWriteKey(date = new Date()) {
  return `kvstats:writes:${date.toISOString().slice(0, 10)}`;
}

function parseDailyWriteCount(raw: string | null) {
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.floor(numeric));

  try {
    const parsed = JSON.parse(raw) as { count?: unknown };
    const count = Number(parsed?.count);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  } catch {
    return 0;
  }
}

export async function beginKvWriteBudget(budget: KvWriteBudget) {
  const kv = metadataKv();
  const key = dailyKvWriteKey();
  const initialCount = kv ? parseDailyWriteCount(await kv.get(key)) : 0;

  currentKvWriteBudget = {
    ...budget,
    key,
    initialCount,
    writes: 0,
    skippedUnchanged: 0,
    stoppedBySoftLimit: initialCount >= budget.softLimit,
    stoppedByHardLimit: initialCount >= budget.hardLimit,
    kv
  };

  return getKvWriteBudgetSnapshot();
}

export function getKvWriteBudgetSnapshot(): KvWriteBudgetSnapshot {
  const state = currentKvWriteBudget;
  if (!state) {
    return {
      daily_write_count: 0,
      kv_writes: 0,
      kv_skipped_unchanged: 0,
      refresh_stopped_by_soft_limit: false,
      refresh_stopped_by_hard_limit: false
    };
  }

  const dailyCount = state.initialCount + state.writes;
  return {
    daily_write_count: dailyCount,
    kv_writes: state.writes,
    kv_skipped_unchanged: state.skippedUnchanged,
    refresh_stopped_by_soft_limit: state.stoppedBySoftLimit,
    refresh_stopped_by_hard_limit: state.stoppedByHardLimit
  };
}

export async function finishKvWriteBudget() {
  const state = currentKvWriteBudget;
  if (!state) return getKvWriteBudgetSnapshot();

  const snapshot = getKvWriteBudgetSnapshot();
  currentKvWriteBudget = undefined;

  if (state.kv && state.writes > 0) {
    const updatedAt = new Date().toISOString();
    try {
      await state.kv.put(state.key, JSON.stringify({ count: snapshot.daily_write_count, updatedAt }), {
        expirationTtl: 60 * 60 * 48,
        metadata: { namespace: "kvstats", updatedAt }
      });
    } catch (error) {
      cacheLog("KV_WRITE_BUDGET_PERSIST_FAILED", {
        key: state.key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return snapshot;
}

function keySlugFromUrl(key: string) {
  try {
    const url = new URL(key);
    const match = /\/phim\/([^/?#]+)/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

async function metadataKey(namespace: string, key: string) {
  if (namespace === "metadata-detail") {
    const slug = keySlugFromUrl(key);
    return slug ? `detail:${MOVIE_LIST_METADATA_CACHE_VERSION}:${slug}` : `detail:${MOVIE_LIST_METADATA_CACHE_VERSION}:${await sha256(key)}`;
  }
  if (namespace === "metadata-search") return `search:${await sha256(key)}`;
  if (namespace === "metadata-list") return `list:${MOVIE_LIST_METADATA_CACHE_VERSION}:${await sha256(key)}`;
  if (namespace === "metadata-taxonomy") return `taxonomy:${await sha256(key)}`;
  return `metadata:${namespace}:${await sha256(key)}`;
}

export async function readJsonCache<T>(namespace: string, key: string, ttlSeconds = detailCacheTtlSeconds(), allowExpired = false): Promise<T | null> {
  const entry = await readJsonCacheEntry<T>(namespace, key, ttlSeconds, allowExpired);
  return entry?.value || null;
}

export async function readJsonCacheEntry<T>(namespace: string, key: string, ttlSeconds = detailCacheTtlSeconds(), allowExpired = false): Promise<JsonCacheEntry<T> | null> {
  const kv = metadataKv();
  const objectKey = await metadataKey(namespace, key);

  if (cacheBypassRefresh()) {
    cacheLog("KV_METADATA_BYPASS_REFRESH", { namespace, key: objectKey });
    return null;
  }

  if (!kv || ttlSeconds <= 0) {
    cacheLog("KV_METADATA_MISS", { namespace, key: objectKey, reason: ttlSeconds <= 0 ? "ttl-zero" : "missing-MOVIE_METADATA-binding" });
    return null;
  }

  try {
    const raw = await kv.get(objectKey);
    if (!raw) {
      cacheLog("KV_METADATA_MISS", { namespace, key: objectKey });
      return null;
    }

    const envelope = JSON.parse(raw) as JsonEnvelope<T>;
    if (!allowExpired && !isCacheEntryFresh(envelope.cachedAt, ttlSeconds)) {
      cacheLog("KV_METADATA_MISS", { namespace, key: objectKey, reason: "stale" });
      return null;
    }

    cacheLog("KV_METADATA_HIT", { namespace, key: objectKey, allowExpired });
    return { value: envelope.value, cachedAt: envelope.cachedAt, hash: envelope.hash };
  } catch (error) {
    cacheLog("KV_METADATA_MISS", { namespace, key: objectKey, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function writeJsonCache(namespace: string, key: string, value: unknown, sourceUrl?: string, ttlSeconds = detailCacheTtlSeconds(), options: WriteJsonCacheOptions = {}) {
  const kv = metadataKv();
  const objectKey = await metadataKey(namespace, key);

  if (!kv || ttlSeconds <= 0) {
    cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: ttlSeconds <= 0 ? "ttl-zero" : "missing-MOVIE_METADATA-binding" });
    return { skipped: true };
  }

  const budget = currentKvWriteBudget;
  const currentDailyCount = budget ? budget.initialCount + budget.writes : 0;
  if (budget && currentDailyCount >= budget.hardLimit) {
    budget.stoppedByHardLimit = true;
    cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: "daily-hard-limit", daily_write_count: currentDailyCount });
    return { skipped: true, reason: "daily-hard-limit" };
  }

  if (budget && !options.critical && currentDailyCount >= budget.softLimit) {
    budget.stoppedBySoftLimit = true;
    cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: "daily-soft-limit", daily_write_count: currentDailyCount });
    return { skipped: true, reason: "daily-soft-limit" };
  }

  const nowSecond = Math.floor(Date.now() / 1000);
  if (lastKvWriteSecond.get(objectKey) === nowSecond) {
    cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: "duplicate-key-same-second" });
    return { skipped: true, reason: "duplicate-key-same-second" };
  }

  const hash = await stableHash(options.hashValue ?? value);
  try {
    const raw = await kv.get(objectKey);
    if (raw) {
      const existing = JSON.parse(raw) as JsonEnvelope<unknown>;
      const existingHash = existing.hash || await stableHash(existing.value);
      if (existingHash === hash) {
        if (budget) budget.skippedUnchanged += 1;
        cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: "unchanged", hash });
        return { skipped: true, reason: "unchanged", hash };
      }
    }
  } catch {
    // Corrupt cache entries should be replaced by the fresh normalized payload.
  }

  const envelope: JsonEnvelope<unknown> = {
    cachedAt: new Date().toISOString(),
    hash,
    sourceUrl,
    value
  };

  try {
    await kv.put(objectKey, JSON.stringify(envelope), {
      expirationTtl: ttlSeconds,
      metadata: { namespace, sourceUrl: sourceUrl || "", cachedAt: envelope.cachedAt, hash }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cacheLog("KV_METADATA_WRITE", {
      namespace,
      key: objectKey,
      skipped: true,
      reason: "write-failed",
      error: message
    });
    return { skipped: true, reason: "write-failed", hash };
  }
  lastKvWriteSecond.set(objectKey, nowSecond);
  if (budget) budget.writes += 1;
  cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, ttlSeconds, hash });
  return { skipped: false, hash };
}

export async function cacheStats() {
  return {
    root: {
      metadata: metadataKv() ? "kv:MOVIE_METADATA|KV" : "missing",
      images: "external:img.bluesia.net"
    },
    ttlSeconds: {
      metadataList: listCacheTtlSeconds(),
      metadataSearch: searchCacheTtlSeconds(),
      metadataDetail: detailCacheTtlSeconds(),
      metadataTaxonomy: taxonomyCacheTtlSeconds()
    }
  };
}

export async function pruneCache(_force = true) {
  cacheLog("KV_METADATA_MISS", { reason: "prune-not-supported-for-kv" });
}
