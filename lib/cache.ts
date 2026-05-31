import { cacheBypassRefresh, runtimeEnv } from "@/lib/runtime-env";

const IMAGE_TTL_SECONDS = 60 * 60 * 24 * 15;
const DETAIL_TTL_SECONDS = 60 * 60 * 24 * 15;
const LIST_TTL_SECONDS = 60 * 60;
const SEARCH_TTL_SECONDS = 0;
const ERROR_TTL_SECONDS = 60;

type MinimalR2Object = {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type MinimalR2Bucket = {
  get(key: string): Promise<MinimalR2Object | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: Array<{ key: string; size: number; uploaded: Date; customMetadata?: Record<string, string> }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

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
  IMAGE_CACHE?: MinimalR2Bucket;
};

type JsonEnvelope<T> = {
  cachedAt: string;
  sourceUrl?: string;
  value: T;
};

export type BinaryCacheHit = {
  body: Uint8Array;
  contentType: string;
  sourceUrl?: string;
  etag?: string;
};

export type JsonCacheEntry<T> = {
  value: T;
  cachedAt?: string;
};

function env() {
  return runtimeEnv<CacheEnv>() || {};
}

function metadataKv() {
  return env().MOVIE_METADATA || env().KV;
}

function imageR2() {
  return env().IMAGE_CACHE;
}

function cacheLog(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

export function logCacheEvent(message: string, details?: Record<string, unknown>) {
  cacheLog(message, details);
}

export function imageCacheTtlSeconds() {
  return IMAGE_TTL_SECONDS;
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
    return slug ? `detail:${slug}` : `detail:${await sha256(key)}`;
  }
  if (namespace === "metadata-search") return `search:${await sha256(key)}`;
  if (namespace === "metadata-list") return `list:${await sha256(key)}`;
  if (namespace === "metadata-taxonomy") return `taxonomy:${await sha256(key)}`;
  return `metadata:${namespace}:${await sha256(key)}`;
}

async function etagFor(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readBinaryCache(_namespace: string, key: string, ttlSeconds = imageCacheTtlSeconds()): Promise<BinaryCacheHit | null> {
  if (cacheBypassRefresh()) {
    cacheLog("IMAGE_R2_MISS", { key, reason: "refresh-bypass" });
    return null;
  }

  const bucket = imageR2();
  if (!bucket) {
    cacheLog("IMAGE_R2_MISS", { key, reason: "missing-IMAGE_CACHE-binding" });
    return null;
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      cacheLog("IMAGE_R2_MISS", { key });
      return null;
    }

    if (!isCacheEntryFresh(object.customMetadata?.cachedAt, ttlSeconds)) {
      cacheLog("IMAGE_R2_MISS", { key, reason: "stale" });
      return null;
    }

    cacheLog("IMAGE_R2_HIT", { key, bytes: object.size });
    return {
      body: new Uint8Array(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType || object.customMetadata?.contentType || "application/octet-stream",
      sourceUrl: object.customMetadata?.sourceUrl,
      etag: object.customMetadata?.etag
    };
  } catch (error) {
    cacheLog("IMAGE_R2_MISS", { key, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function writeBinaryCache(_namespace: string, key: string, body: Uint8Array, contentType: string, sourceUrl?: string): Promise<{ etag: string; skipped?: boolean }> {
  const etag = await etagFor(body);
  const bucket = imageR2();
  if (!bucket) {
    cacheLog("IMAGE_R2_WRITE", { key, skipped: true, reason: "missing-IMAGE_CACHE-binding" });
    return { etag, skipped: true };
  }

  if (!body.byteLength || !contentType.toLowerCase().startsWith("image/")) {
    cacheLog("IMAGE_R2_WRITE", { key, skipped: true, reason: "invalid-image-response" });
    return { etag, skipped: true };
  }

  await bucket.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: {
      contentType,
      sourceUrl: sourceUrl || "",
      etag,
      cachedAt: new Date().toISOString()
    }
  });
  cacheLog("IMAGE_R2_WRITE", { key, bytes: body.byteLength, contentType });
  return { etag };
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
    return { value: envelope.value, cachedAt: envelope.cachedAt };
  } catch (error) {
    cacheLog("KV_METADATA_MISS", { namespace, key: objectKey, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function writeJsonCache(namespace: string, key: string, value: unknown, sourceUrl?: string, ttlSeconds = detailCacheTtlSeconds()) {
  const kv = metadataKv();
  const objectKey = await metadataKey(namespace, key);

  if (!kv || ttlSeconds <= 0) {
    cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, skipped: true, reason: ttlSeconds <= 0 ? "ttl-zero" : "missing-MOVIE_METADATA-binding" });
    return { skipped: true };
  }

  const envelope: JsonEnvelope<unknown> = {
    cachedAt: new Date().toISOString(),
    sourceUrl,
    value
  };

  await kv.put(objectKey, JSON.stringify(envelope), {
    expirationTtl: ttlSeconds,
    metadata: { namespace, sourceUrl: sourceUrl || "", cachedAt: envelope.cachedAt }
  });
  cacheLog("KV_METADATA_WRITE", { namespace, key: objectKey, ttlSeconds });
  return { skipped: false };
}

export async function cacheStats() {
  return {
    root: {
      metadata: metadataKv() ? "kv:MOVIE_METADATA|KV" : "missing",
      images: imageR2() ? "r2:IMAGE_CACHE" : "missing"
    },
    ttlSeconds: {
      images: imageCacheTtlSeconds(),
      metadataList: listCacheTtlSeconds(),
      metadataSearch: searchCacheTtlSeconds(),
      metadataDetail: detailCacheTtlSeconds(),
      metadataTaxonomy: taxonomyCacheTtlSeconds()
    }
  };
}

export async function pruneCache(_force = true) {
  cacheLog("KV_METADATA_MISS", { reason: "prune-not-supported-for-kv-r2-split" });
}
