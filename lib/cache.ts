import { runtimeEnv } from "@/lib/runtime-env";

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const DEFAULT_METADATA_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_IMAGE_MAX_BYTES = 400 * 1024 * 1024;
const DEFAULT_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 15;
const DEFAULT_DETAIL_TTL_SECONDS = 60 * 60 * 24 * 15;
const DEFAULT_LIST_TTL_SECONDS = 60 * 5;
const DEFAULT_SEARCH_TTL_SECONDS = 60 * 30;

type MinimalR2Object = {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
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

type CacheEnv = {
  BLUESIA_CACHE_R2?: MinimalR2Bucket;
  BLUESIA_CACHE_MAX_BYTES?: string;
  FILM_BLUESIA_NET_CACHE_MAX_BYTES?: string;
  BLUESIA_CACHE_METADATA_MAX_BYTES?: string;
  BLUESIA_CACHE_IMAGE_MAX_BYTES?: string;
  BLUESIA_IMAGE_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_IMAGE_CACHE_TTL_SECONDS?: string;
  BLUESIA_DETAIL_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_DETAIL_CACHE_TTL_SECONDS?: string;
  BLUESIA_TAXONOMY_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_TAXONOMY_CACHE_TTL_SECONDS?: string;
  BLUESIA_LIST_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_LIST_CACHE_TTL_SECONDS?: string;
  BLUESIA_SEARCH_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_SEARCH_CACHE_TTL_SECONDS?: string;
  BLUESIA_CACHE_TTL_SECONDS?: string;
  FILM_BLUESIA_NET_CACHE_TTL_SECONDS?: string;
};

type CacheMeta = {
  key: string;
  namespace: string;
  contentType?: string;
  sourceUrl?: string;
  cachedAt: string;
  size: number;
  etag?: string;
};

export type BinaryCacheHit = {
  body: Uint8Array;
  contentType: string;
  sourceUrl?: string;
  etag?: string;
};

const memoryCache = new Map<string, { bytes: Uint8Array; meta: CacheMeta }>();

function env() {
  return runtimeEnv<CacheEnv>() || {};
}

function firstDefinedEnv(names: string[]) {
  const values = env();
  for (const name of names) {
    const value = values[name as keyof CacheEnv] || process.env[name];
    if (value) return String(value);
  }
  return undefined;
}

function numberFromEnvs(names: string[], fallback: number) {
  for (const name of names) {
    const value = Number(firstDefinedEnv([name]));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

export function cacheRoot() {
  return "cloudflare-r2-or-memory";
}

export function cacheMaxBytes() {
  return Math.min(
    DEFAULT_MAX_BYTES,
    numberFromEnvs(["FILM_BLUESIA_NET_CACHE_MAX_BYTES", "BLUESIA_CACHE_MAX_BYTES"], DEFAULT_MAX_BYTES)
  );
}

function metadataMaxBytes() {
  return Math.min(
    cacheMaxBytes(),
    numberFromEnvs(["BLUESIA_CACHE_METADATA_MAX_BYTES"], DEFAULT_METADATA_MAX_BYTES)
  );
}

function imageMaxBytes() {
  return Math.min(
    cacheMaxBytes(),
    numberFromEnvs(["BLUESIA_CACHE_IMAGE_MAX_BYTES"], DEFAULT_IMAGE_MAX_BYTES)
  );
}

export function imageCacheTtlSeconds() {
  return numberFromEnvs(
    ["FILM_BLUESIA_NET_IMAGE_CACHE_TTL_SECONDS", "BLUESIA_IMAGE_CACHE_TTL_SECONDS"],
    numberFromEnvs(["FILM_BLUESIA_NET_CACHE_TTL_SECONDS", "BLUESIA_CACHE_TTL_SECONDS"], DEFAULT_IMAGE_TTL_SECONDS)
  );
}

export function detailCacheTtlSeconds() {
  return numberFromEnvs(
    ["FILM_BLUESIA_NET_DETAIL_CACHE_TTL_SECONDS", "BLUESIA_DETAIL_CACHE_TTL_SECONDS"],
    numberFromEnvs(["FILM_BLUESIA_NET_CACHE_TTL_SECONDS", "BLUESIA_CACHE_TTL_SECONDS"], DEFAULT_DETAIL_TTL_SECONDS)
  );
}

export function taxonomyCacheTtlSeconds() {
  return numberFromEnvs(["FILM_BLUESIA_NET_TAXONOMY_CACHE_TTL_SECONDS", "BLUESIA_TAXONOMY_CACHE_TTL_SECONDS"], detailCacheTtlSeconds());
}

export function listCacheTtlSeconds() {
  return numberFromEnvs(["FILM_BLUESIA_NET_LIST_CACHE_TTL_SECONDS", "BLUESIA_LIST_CACHE_TTL_SECONDS"], DEFAULT_LIST_TTL_SECONDS);
}

export function searchCacheTtlSeconds() {
  return numberFromEnvs(["FILM_BLUESIA_NET_SEARCH_CACHE_TTL_SECONDS", "BLUESIA_SEARCH_CACHE_TTL_SECONDS"], DEFAULT_SEARCH_TTL_SECONDS);
}

function safeNamespace(namespace: string) {
  return namespace.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
}

async function hashKey(key: string) {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function objectKey(namespace: string, key: string, extension: "bin" | "json" | "meta") {
  return `${safeNamespace(namespace)}/${await hashKey(key)}.${extension}`;
}

function ttlForNamespace(namespace: string) {
  if (namespace === "images") return imageCacheTtlSeconds();
  if (namespace === "metadata-list") return listCacheTtlSeconds();
  if (namespace === "metadata-search") return searchCacheTtlSeconds();
  if (namespace === "metadata-detail") return detailCacheTtlSeconds();
  if (namespace === "metadata-taxonomy") return taxonomyCacheTtlSeconds();
  return detailCacheTtlSeconds();
}

function isFresh(cachedAt: string | undefined, ttlSeconds: number) {
  const time = cachedAt ? Date.parse(cachedAt) : 0;
  return Number.isFinite(time) && Date.now() - time <= ttlSeconds * 1000;
}

function bucket() {
  return env().BLUESIA_CACHE_R2;
}

function budgetForNamespace(namespace: string) {
  return namespace === "images" ? imageMaxBytes() : metadataMaxBytes();
}

async function namespaceUsage(namespace: string) {
  const r2 = bucket();
  const prefix = `${safeNamespace(namespace)}/`;
  let totalBytes = 0;
  let entries = 0;
  let cursor: string | undefined;

  if (!r2) {
    for (const [key, value] of memoryCache.entries()) {
      if (key.startsWith(prefix) && !key.endsWith(".meta")) {
        totalBytes += value.meta.size;
        entries += 1;
      }
    }
    return { totalBytes, entries };
  }

  do {
    const page = await r2.list({ prefix, limit: 1000, cursor });
    for (const object of page.objects) {
      if (!object.key.endsWith(".meta")) {
        totalBytes += object.size;
        entries += 1;
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return { totalBytes, entries };
}

async function canWrite(namespace: string, size: number) {
  if (size > budgetForNamespace(namespace)) return false;
  const usage = await namespaceUsage(namespace);
  return usage.totalBytes + size <= budgetForNamespace(namespace) && usage.totalBytes + size <= cacheMaxBytes();
}

export async function cacheStats() {
  const namespaces: Record<string, { bytes: number; entries: number }> = {};
  for (const namespace of ["images", "metadata-list", "metadata-search", "metadata-detail", "metadata-taxonomy"]) {
    const usage = await namespaceUsage(namespace);
    if (usage.entries || usage.totalBytes) namespaces[namespace] = { bytes: usage.totalBytes, entries: usage.entries };
  }

  return {
    root: bucket() ? "r2:BLUESIA_CACHE_R2" : "memory",
    maxBytes: cacheMaxBytes(),
    metadataMaxBytes: metadataMaxBytes(),
    imageMaxBytes: imageMaxBytes(),
    totalBytes: Object.values(namespaces).reduce((total, item) => total + item.bytes, 0),
    entries: Object.values(namespaces).reduce((total, item) => total + item.entries, 0),
    ttlSeconds: {
      images: imageCacheTtlSeconds(),
      metadataList: listCacheTtlSeconds(),
      metadataSearch: searchCacheTtlSeconds(),
      metadataDetail: detailCacheTtlSeconds(),
      metadataTaxonomy: taxonomyCacheTtlSeconds()
    },
    namespaces
  };
}

export async function pruneCache() {
  return;
}

export async function readBinaryCache(namespace: string, key: string, ttlSeconds = ttlForNamespace(namespace)): Promise<BinaryCacheHit | null> {
  const dataKey = await objectKey(namespace, key, "bin");
  const metaKey = await objectKey(namespace, key, "meta");
  const r2 = bucket();

  try {
    if (!r2) {
      const entry = memoryCache.get(dataKey);
      if (!entry || !isFresh(entry.meta.cachedAt, ttlSeconds)) return null;
      return {
        body: entry.bytes,
        contentType: entry.meta.contentType || "application/octet-stream",
        sourceUrl: entry.meta.sourceUrl,
        etag: entry.meta.etag
      };
    }

    const [bodyObject, metaObject] = await Promise.all([r2.get(dataKey), r2.get(metaKey)]);
    if (!bodyObject) return null;
    const meta = metaObject ? JSON.parse(await metaObject.text()) as Partial<CacheMeta> : {};
    if (!isFresh(meta.cachedAt || bodyObject.uploaded?.toISOString(), ttlSeconds)) return null;
    return {
      body: new Uint8Array(await bodyObject.arrayBuffer()),
      contentType: meta.contentType || bodyObject.httpMetadata?.contentType || "application/octet-stream",
      sourceUrl: meta.sourceUrl,
      etag: meta.etag
    };
  } catch {
    return null;
  }
}

async function etagFor(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function writeBinaryCache(namespace: string, key: string, body: Uint8Array, contentType: string, sourceUrl?: string): Promise<{ etag: string; skipped?: boolean }> {
  const etag = await etagFor(body);
  const meta: CacheMeta = {
    namespace: safeNamespace(namespace),
    key,
    contentType,
    sourceUrl,
    cachedAt: new Date().toISOString(),
    size: body.byteLength,
    etag
  };

  if (!(await canWrite(namespace, body.byteLength))) {
    return { etag, skipped: true };
  }

  const dataKey = await objectKey(namespace, key, "bin");
  const metaKey = await objectKey(namespace, key, "meta");
  const r2 = bucket();

  if (!r2) {
    memoryCache.set(dataKey, { bytes: body, meta });
    memoryCache.set(metaKey, { bytes: new TextEncoder().encode(JSON.stringify(meta)), meta });
    return { etag };
  }

  await Promise.all([
    r2.put(dataKey, body, { httpMetadata: { contentType }, customMetadata: { namespace: meta.namespace, cachedAt: meta.cachedAt, size: String(meta.size) } }),
    r2.put(metaKey, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, customMetadata: { namespace: meta.namespace, cachedAt: meta.cachedAt } })
  ]);
  return { etag };
}

export async function readJsonCache<T>(namespace: string, key: string, ttlSeconds = ttlForNamespace(namespace), allowExpired = false): Promise<T | null> {
  const dataKey = await objectKey(namespace, key, "json");
  const metaKey = await objectKey(namespace, key, "meta");
  const r2 = bucket();

  try {
    if (!r2) {
      const entry = memoryCache.get(dataKey);
      if (!entry || (!allowExpired && !isFresh(entry.meta.cachedAt, ttlSeconds))) return null;
      return JSON.parse(new TextDecoder().decode(entry.bytes)) as T;
    }

    const [bodyObject, metaObject] = await Promise.all([r2.get(dataKey), r2.get(metaKey)]);
    if (!bodyObject) return null;
    const meta = metaObject ? JSON.parse(await metaObject.text()) as Partial<CacheMeta> : {};
    if (!allowExpired && !isFresh(meta.cachedAt || bodyObject.uploaded?.toISOString(), ttlSeconds)) return null;
    return JSON.parse(await bodyObject.text()) as T;
  } catch {
    return null;
  }
}

export async function writeJsonCache(namespace: string, key: string, value: unknown, sourceUrl?: string) {
  const body = JSON.stringify(value);
  const bytes = new TextEncoder().encode(body);
  if (!(await canWrite(namespace, bytes.byteLength))) return { skipped: true };

  const meta: CacheMeta = {
    namespace: safeNamespace(namespace),
    key,
    contentType: "application/json",
    sourceUrl,
    cachedAt: new Date().toISOString(),
    size: bytes.byteLength
  };

  const dataKey = await objectKey(namespace, key, "json");
  const metaKey = await objectKey(namespace, key, "meta");
  const r2 = bucket();

  if (!r2) {
    memoryCache.set(dataKey, { bytes, meta });
    memoryCache.set(metaKey, { bytes: new TextEncoder().encode(JSON.stringify(meta)), meta });
    return { skipped: false };
  }

  await Promise.all([
    r2.put(dataKey, body, { httpMetadata: { contentType: "application/json" }, customMetadata: { namespace: meta.namespace, cachedAt: meta.cachedAt, size: String(meta.size) } }),
    r2.put(metaKey, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, customMetadata: { namespace: meta.namespace, cachedAt: meta.cachedAt } })
  ]);
  return { skipped: false };
}
