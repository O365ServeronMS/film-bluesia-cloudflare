import { defineMiddleware } from "astro:middleware";
import { env as cloudflareEnv } from "cloudflare:workers";
import { isMobilePlaybackUserAgent } from "@/lib/playback";
import { setCacheBypassRefresh, setRuntimeEnv } from "@/lib/runtime-env";

const CACHEABLE_LIST_TYPES = new Set(["phim-le", "phim-bo", "tv-shows", "hoat-hinh"]);
const PRIVATE_HTML_PATHS = new Set(["/favorites", "/history", "/settings"]);
const LIST_HTML_TTL_SECONDS = 1800;
const MOVIE_LONG_HTML_TTL_SECONDS = 7776000;
const MOVIE_SHORT_HTML_TTL_SECONDS = 86400;
const STALE_WHILE_REVALIDATE_SECONDS = 1800;
const DEFAULT_HTML_CACHE_VERSION = "2026-06-01-ophim-imdb-v5";
const MOVIE_PLAYBACK_PARAMS = ["server", "ep", "player", "mirror", "play"] as const;

type HtmlCachePolicy = {
  browserMaxAge: number;
  sharedMaxAge: number;
  staleWhileRevalidate: number;
};

const PUBLIC_HTML_POLICIES = {
  home: { browserMaxAge: 0, sharedMaxAge: LIST_HTML_TTL_SECONDS, staleWhileRevalidate: STALE_WHILE_REVALIDATE_SECONDS },
  list: { browserMaxAge: 0, sharedMaxAge: LIST_HTML_TTL_SECONDS, staleWhileRevalidate: STALE_WHILE_REVALIDATE_SECONDS },
  taxonomy: { browserMaxAge: 0, sharedMaxAge: LIST_HTML_TTL_SECONDS, staleWhileRevalidate: STALE_WHILE_REVALIDATE_SECONDS },
  movieShort: { browserMaxAge: 0, sharedMaxAge: MOVIE_SHORT_HTML_TTL_SECONDS, staleWhileRevalidate: STALE_WHILE_REVALIDATE_SECONDS },
  movieLong: { browserMaxAge: 0, sharedMaxAge: MOVIE_LONG_HTML_TTL_SECONDS, staleWhileRevalidate: STALE_WHILE_REVALIDATE_SECONDS }
} satisfies Record<string, HtmlCachePolicy>;

function normalizedPath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

function isHtmlRequest(request: Request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function cacheHeader(policy: HtmlCachePolicy) {
  return [
    "public",
    `max-age=${policy.browserMaxAge}`,
    `s-maxage=${policy.sharedMaxAge}`,
    `stale-while-revalidate=${policy.staleWhileRevalidate}`
  ].join(", ");
}

function publicHtmlPolicy(pathname: string): HtmlCachePolicy | null {
  const path = normalizedPath(pathname);

  if (path === "/") return PUBLIC_HTML_POLICIES.home;

  const listMatch = /^\/list\/([^/]+)$/.exec(path);
  if (listMatch && CACHEABLE_LIST_TYPES.has(listMatch[1])) {
    return PUBLIC_HTML_POLICIES.list;
  }

  if (/^\/movie\/[^/]+$/.test(path)) {
    return PUBLIC_HTML_POLICIES.movieShort;
  }

  if (/^\/(category|the-loai|country|quoc-gia|year|nam)\/[^/]+$/.test(path)) {
    return PUBLIC_HTML_POLICIES.taxonomy;
  }

  return null;
}

function htmlCacheVersion(env: Record<string, unknown> | undefined) {
  const versionMetadata = env?.WORKER_VERSION;
  if (versionMetadata && typeof versionMetadata === "object") {
    const versionId = (versionMetadata as { id?: unknown }).id;
    if (typeof versionId === "string" && versionId) return versionId;
  }

  return String(env?.HTML_CACHE_VERSION || process.env.HTML_CACHE_VERSION || DEFAULT_HTML_CACHE_VERSION);
}

function canonicalHtmlSearch(url: URL) {
  const path = normalizedPath(url.pathname);
  const source = url.searchParams;
  const canonical = new URLSearchParams();

  if (/^\/list\/[^/]+$/.test(path)) {
    for (const key of ["page", "country", "category"]) {
      const value = source.get(key);
      if (value) canonical.set(key, value);
    }
  } else if (/^\/movie\/[^/]+$/.test(path)) {
    const returnTo = source.get("returnTo");
    if (returnTo) canonical.set("returnTo", returnTo);
  } else if (/^\/(category|the-loai|country|quoc-gia|year|nam)\/[^/]+$/.test(path)) {
    const page = source.get("page");
    if (page) canonical.set("page", page);
  }

  return canonical;
}

function hasMoviePlaybackVariant(url: URL) {
  const path = normalizedPath(url.pathname);
  return /^\/movie\/[^/]+$/.test(path) && MOVIE_PLAYBACK_PARAMS.some((key) => url.searchParams.has(key));
}

function canonicalCacheRequest(url: URL, version: string, request: Request) {
  const cacheUrl = new URL(url.toString());
  cacheUrl.search = canonicalHtmlSearch(url).toString();
  if (/^\/movie\/[^/]+$/.test(normalizedPath(url.pathname))) {
    const userAgent = request.headers.get("user-agent") || "";
    cacheUrl.searchParams.set("__playback_device", isMobilePlaybackUserAgent(userAgent) ? "mobile" : "desktop");
  }
  cacheUrl.searchParams.set("__html_cache_version", version);
  return new Request(cacheUrl.toString(), { method: "GET" });
}

function validRefreshBypass(url: URL, env: Record<string, unknown> | undefined) {
  if (url.searchParams.get("refresh") !== "1") return false;
  const expected = String(env?.CACHE_REFRESH_TOKEN || process.env.CACHE_REFRESH_TOKEN || "");
  return Boolean(expected && url.searchParams.get("token") === expected);
}

function cacheEvent(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

function isExplicitlyPrivateHtml(pathname: string) {
  const path = normalizedPath(pathname);
  return PRIVATE_HTML_PATHS.has(path) || path.startsWith("/watch/") || path === "/search";
}

function applyHtmlCacheHeaders(response: Response, policy: HtmlCachePolicy) {
  const value = cacheHeader(policy);
  response.headers.set("Cache-Control", value);
  response.headers.set("CDN-Cache-Control", value);
  response.headers.set("Cloudflare-CDN-Cache-Control", value);
  response.headers.append("Vary", "Accept-Encoding");
}

function applyNoStoreHeaders(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = cloudflareEnv as unknown as Record<string, unknown>;
  setRuntimeEnv(env);
  const bypassRefresh = validRefreshBypass(context.url, env);
  setCacheBypassRefresh(bypassRefresh);
  const cacheVersion = htmlCacheVersion(env);
  const cacheRequest = canonicalCacheRequest(context.url, cacheVersion, context.request);
  const initialPolicy = publicHtmlPolicy(context.url.pathname);
  const canUseHtmlCache = ["GET", "HEAD"].includes(context.request.method) &&
    isHtmlRequest(context.request) &&
    Boolean(initialPolicy) &&
    !bypassRefresh &&
    typeof caches !== "undefined";

  if (canUseHtmlCache) {
    const cached = await caches.default.match(cacheRequest);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set("X-Film-Bluesia-Cache", "HTML_CACHE_HIT");
      hit.headers.set("X-Film-Bluesia-HTML-Cache-Version", cacheVersion);
      cacheEvent("HTML_CACHE_HIT", { type: "html", url: cacheRequest.url });
      setCacheBypassRefresh(false);
      return hit;
    }
    cacheEvent("HTML_CACHE_MISS", { type: "html", url: cacheRequest.url });
  } else if (bypassRefresh) {
    cacheEvent("HTML_CACHE_BYPASS_REFRESH", { type: "html", url: cacheRequest.url });
  }

  let response: Response;
  try {
    response = await next();
  } finally {
    setCacheBypassRefresh(false);
  }

  if (!["GET", "HEAD"].includes(context.request.method) || !isHtmlRequest(context.request)) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  if (response.status !== 200) {
    applyNoStoreHeaders(response);
    return response;
  }

  const policy = publicHtmlPolicy(context.url.pathname);
  if (policy) {
    if (hasMoviePlaybackVariant(context.url)) {
      applyNoStoreHeaders(response);
      response.headers.set("X-Film-Bluesia-Cache", "HTML_CACHE_BYPASS_PLAYBACK_VARIANT");
      response.headers.set("X-Film-Bluesia-HTML-Cache-Version", cacheVersion);
      return response;
    }

    const movieCacheClass = response.headers.get("X-Film-Bluesia-Movie-Cache-Class");
    const finalPolicy = movieCacheClass === "full"
      ? PUBLIC_HTML_POLICIES.movieLong
      : movieCacheClass === "short"
        ? PUBLIC_HTML_POLICIES.movieShort
        : policy;
    response.headers.delete("X-Film-Bluesia-Movie-Cache-Class");
    applyHtmlCacheHeaders(response, finalPolicy);
    response.headers.set("X-Film-Bluesia-Cache", bypassRefresh ? "HTML_CACHE_BYPASS_REFRESH" : "HTML_CACHE_MISS");
    response.headers.set("X-Film-Bluesia-HTML-Cache-Version", cacheVersion);

    if (context.request.method === "GET" && typeof caches !== "undefined") {
      await caches.default.put(cacheRequest, response.clone());
      cacheEvent("HTML_CACHE_WRITE", { type: "html", url: cacheRequest.url, ttlSeconds: finalPolicy.sharedMaxAge });
    }
  } else if (isExplicitlyPrivateHtml(context.url.pathname) || !context.url.pathname.startsWith("/api/")) {
    applyNoStoreHeaders(response);
  }

  return response;
});
