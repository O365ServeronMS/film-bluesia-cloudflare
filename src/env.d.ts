/// <reference types="astro/client" />

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; metadata?: Record<string, string> }>;
    list_complete: boolean;
    cursor?: string;
  }>;
};
type CloudflareRuntime = {
  env: {
    KV?: KVNamespace;
    MOVIE_METADATA?: KVNamespace;
    WORKER_VERSION?: {
      id: string;
      tag: string;
      timestamp: string;
    };
    ADMIN_REFRESH_TOKEN?: string;
    CACHE_REFRESH_TOKEN?: string;
    IMAGE_CACHE_BASE_URL?: string;
    IMAGE_CACHE_SIGNING_SECRET?: string;
    OPHIM_BASE_URL?: string;
    OPHIM_REFRESH_MAX_MOVIES?: string;
    OPHIM_REFRESH_DELAY_MS?: string;
    SEARCH_RATE_LIMITER?: {
      limit(input: { key: string }): Promise<{ success: boolean }>;
    };
    VSEMBED_EMBED_BASE_URL?: string;
    VSEMBED_MOBILE_EMBED_HOST?: string;
  };
};
