import type { APIRoute } from "astro";
import { imageCacheTtlSeconds, readBinaryCache, writeBinaryCache } from "@/lib/cache";
import { imageHostErrorBody, imageSourceRegistry, validateImageSourceUrl } from "@/lib/image-source-registry";
import { runtimeEnv } from "@/lib/runtime-env";

const FALLBACK_IMAGE_ROOTS = ["https://img.ophim.live", "https://img.ophim1.com"];
const IMAGE_STALE_WHILE_REVALIDATE_SECONDS = 86400;
const DEFAULT_IMAGE_CACHE_PREFIX = "cf-img-jun-2026-v2";
const VALIDATION_ERROR_CACHE_CONTROL = "no-store";
const UPSTREAM_ERROR_CACHE_CONTROL = "public, max-age=300";
const REDIRECT_LIMIT = 4;

type ImageProfileName =
  | "poster-mobile"
  | "poster-desktop"
  | "backdrop-mobile"
  | "backdrop-desktop"
  | "thumb-mobile"
  | "thumb-desktop";

type ImageProfile = {
  name: ImageProfileName;
  type: "poster" | "backdrop" | "thumb";
  width: number;
  quality: number;
  maxOriginBytes: number;
  hardOriginBytes: number;
  targetOutputBytes: number;
  maxOriginFallbackBytes: number;
};

const PROFILES: Record<ImageProfileName, ImageProfile> = {
  "poster-mobile": { name: "poster-mobile", type: "poster", width: 360, quality: 65, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 700_000, maxOriginFallbackBytes: 700_000 },
  "poster-desktop": { name: "poster-desktop", type: "poster", width: 560, quality: 75, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 1_200_000, maxOriginFallbackBytes: 1_200_000 },
  "backdrop-mobile": { name: "backdrop-mobile", type: "backdrop", width: 780, quality: 60, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 1_500_000, maxOriginFallbackBytes: 1_500_000 },
  "backdrop-desktop": { name: "backdrop-desktop", type: "backdrop", width: 1280, quality: 70, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 2_500_000, maxOriginFallbackBytes: 2_500_000 },
  "thumb-mobile": { name: "thumb-mobile", type: "thumb", width: 320, quality: 65, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 700_000, maxOriginFallbackBytes: 700_000 },
  "thumb-desktop": { name: "thumb-desktop", type: "thumb", width: 480, quality: 70, maxOriginBytes: 5_000_000, hardOriginBytes: 8_000_000, targetOutputBytes: 1_200_000, maxOriginFallbackBytes: 1_200_000 }
};

function cacheLog(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function imageCachePrefix() {
  const env = runtimeEnv<Record<string, unknown>>() || {};
  return String(env.IMAGE_CACHE_VERSION || process.env.IMAGE_CACHE_VERSION || DEFAULT_IMAGE_CACHE_PREFIX).trim() || DEFAULT_IMAGE_CACHE_PREFIX;
}

function normalizedOriginalUrl(imageUrl: string) {
  const result = validateImageSourceUrl(imageUrl);
  if (!result.ok) return "";
  const url = result.url;
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function numberParam(...values: Array<string | null>) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function legacyType(value: string | null) {
  const type = String(value || "poster").trim().toLowerCase();
  return type === "backdrop" || type === "thumb" || type === "poster" ? type : "poster";
}

function imageProfile(url: URL): ImageProfile {
  const requested = String(url.searchParams.get("profile") || "").trim().toLowerCase();
  if (requested in PROFILES) return PROFILES[requested as ImageProfileName];

  const type = legacyType(url.searchParams.get("type"));
  const width = numberParam(url.searchParams.get("w"), url.searchParams.get("width"));
  if (type === "backdrop") return width >= 1000 ? PROFILES["backdrop-desktop"] : PROFILES["backdrop-mobile"];
  if (type === "thumb") return width >= 400 ? PROFILES["thumb-desktop"] : PROFILES["thumb-mobile"];
  return width >= 480 ? PROFILES["poster-desktop"] : PROFILES["poster-mobile"];
}

function isTrustedOphimMirror(url: URL, registry = imageSourceRegistry()) {
  return registry.allowedHosts.has(url.hostname) || registry.allowedSuffixes.some((suffix) => url.hostname.endsWith(suffix));
}

function imageCandidates(originalUrl: string) {
  const registry = imageSourceRegistry();
  const result = validateImageSourceUrl(originalUrl, registry);
  if (!result.ok) return [];
  const url = result.url;

  const candidates = [originalUrl];
  const fileName = url.pathname.split("/").filter(Boolean).pop();

  if (isTrustedOphimMirror(url, registry) && fileName) {
    const existingPath = url.pathname.startsWith("/uploads/movies/")
      ? url.pathname
      : `/uploads/movies/${fileName}`;
    candidates.push(`${url.protocol}//${url.host}${existingPath}`);
    for (const root of FALLBACK_IMAGE_ROOTS) {
      candidates.push(`${root}${existingPath}`);
    }
  }

  return unique(candidates);
}

function cacheIdentity(profile: ImageProfile, normalizedUrl: string) {
  const prefix = imageCachePrefix();
  const result = validateImageSourceUrl(normalizedUrl);
  if (result.ok && isTrustedOphimMirror(result.url)) {
    return `ophim:${result.url.pathname}:${profile.name}:${prefix}`;
  }
  return `url:${normalizedUrl}:${profile.name}:${prefix}`;
}

async function cacheKey(profile: ImageProfile, identity: string) {
  return `${imageCachePrefix()}/${profile.name}/${await sha256(identity)}.webp`;
}

function cacheControlHeader() {
  return successCacheControlHeader();
}

function successCacheControlHeader() {
  return `public, max-age=604800, stale-while-revalidate=${IMAGE_STALE_WHILE_REVALIDATE_SECONDS}`;
}

function imageHeaders(options: {
  cacheStatus: "HIT" | "MISS" | "BYPASS" | "FALLBACK";
  sourceUrl?: string;
  profile?: ImageProfileName;
  etag?: string;
  contentType?: string;
  transformStatus?: "transformed" | "origin-fallback";
}) {
  const cacheControl = cacheControlHeader();
  const contentType = options.contentType || "image/webp";
  const imageFormat = contentType.split(";")[0]?.split("/")[1] || "";
  return {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Cloudflare-CDN-Cache-Control": cacheControl,
    "X-Film-Bluesia-Net-Cache": options.cacheStatus,
    "X-Film-Bluesia-Net-Cache-Type": "image",
    "X-Film-Bluesia-Net-Image-Format": imageFormat,
    "X-Film-Bluesia-Net-Image-Profile": options.profile || "",
    "X-Film-Bluesia-Net-Image-Transform": options.transformStatus || (contentType === "image/webp" ? "transformed" : "origin-fallback"),
    "X-Film-Bluesia-Net-Image-Variant": "cloudflare-profile-v3",
    ...(options.etag ? { "ETag": `"${options.etag}"` } : {}),
    ...(options.sourceUrl ? { "X-Film-Bluesia-Net-Image-Source": options.sourceUrl } : {})
  };
}

function notModified(etag: string) {
  const cacheControl = cacheControlHeader();
  return new Response(null, {
    status: 304,
    headers: {
      "ETag": `"${etag}"`,
      "Cache-Control": cacheControl,
      "CDN-Cache-Control": cacheControl,
      "Cloudflare-CDN-Cache-Control": cacheControl
    }
  });
}

function edgeCacheRequest(requestUrl: URL, profile: ImageProfile, normalizedUrl: string) {
  const edgeUrl = new URL(requestUrl.origin + requestUrl.pathname);
  edgeUrl.searchParams.set("cache_version", `${imageCachePrefix()}:reject-large-origin-v1`);
  edgeUrl.searchParams.set("profile", profile.name);
  edgeUrl.searchParams.set("url", normalizedUrl);
  return new Request(edgeUrl.toString(), { method: "GET" });
}

function imageFetchHeaders() {
  return {
    "User-Agent": "Mozilla/5.0 (film.bluesia.net; Cloudflare image profile proxy)",
    "Accept": "image/webp,image/*,*/*",
    "Referer": process.env.OPHIM_BASE_URL || "https://ophim1.com/"
  };
}

async function fetchOriginImage(url: string) {
  return fetch(url, {
    headers: imageFetchHeaders(),
    cache: "no-store",
    redirect: "manual"
  });
}

async function fetchOptimizedImage(url: string, profile: ImageProfile) {
  const init: RequestInit & { cf?: { image?: { width: number; quality: number; format: "webp" } } } = {
    headers: imageFetchHeaders(),
    cache: "no-store",
    redirect: "manual",
    cf: {
      image: {
        width: profile.width,
        quality: profile.quality,
        format: "webp"
      }
    }
  };

  return fetch(url, init);
}

function jsonErrorResponse(body: Record<string, unknown>, status: number, cacheControl: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": cacheControl,
      "CDN-Cache-Control": cacheControl,
      "Cloudflare-CDN-Cache-Control": cacheControl,
      "X-Film-Bluesia-Net-Cache-Type": "image"
    }
  });
}

async function putEdgeCache(request: Request, response: Response, details: Record<string, unknown>) {
  if (typeof caches === "undefined") return;
  try {
    await caches.default.put(request, response.clone());
  } catch (error) {
    cacheLog("IMAGE_CACHE_PUT_FAIL", { ...details, reason: "edge-cache-write", error: error instanceof Error ? error.message : String(error) });
  }
}

function usableImageContentType(value: string) {
  const contentType = value.toLowerCase().split(";")[0].trim();
  return /^(image\/webp|image\/jpeg|image\/jpg|image\/png|image\/avif)$/.test(contentType) ? contentType : "";
}

function imageTransformStatus(contentType: string) {
  return contentType === "image/webp" ? "transformed" : "origin-fallback";
}

function originFallbackTooLarge(profile: ImageProfile, contentType: string, byteLength: number) {
  return imageTransformStatus(contentType) === "origin-fallback" && byteLength > profile.hardOriginBytes;
}

function originTooLarge(profile: ImageProfile, byteLength: number) {
  return byteLength > profile.hardOriginBytes;
}

function redirectedStatus(status: number) {
  return status >= 300 && status < 400;
}

async function fetchAllowedImage(candidate: string, profile: ImageProfile) {
  let current = candidate;
  const registry = imageSourceRegistry();

  for (let redirects = 0; redirects <= REDIRECT_LIMIT; redirects += 1) {
    const validation = validateImageSourceUrl(current, registry);
    if (!validation.ok) {
      cacheLog("IMAGE_HOST_NOT_ALLOWED", {
        host: validation.host,
        profile: profile.name,
        sourceOrigin: current,
        error: validation.error
      });
      return { response: null, rejection: validation, finalUrl: current };
    }

    const response = await fetchOriginImage(validation.url.toString());
    if (!redirectedStatus(response.status)) {
      const finalUrl = response.url || validation.url.toString();
      const finalValidation = validateImageSourceUrl(finalUrl, registry);
      if (!finalValidation.ok) {
        cacheLog("IMAGE_HOST_NOT_ALLOWED", {
          host: finalValidation.host,
          profile: profile.name,
          sourceOrigin: finalUrl,
          error: finalValidation.error
        });
        return { response: null, rejection: finalValidation, finalUrl };
      }
      return { response, rejection: null, finalUrl: finalValidation.url.toString() };
    }

    const location = response.headers.get("location") || "";
    if (!location) return { response, rejection: null, finalUrl: validation.url.toString() };
    current = new URL(location, validation.url).toString();
  }

  return { response: null, rejection: null, finalUrl: current, redirectLimitExceeded: true };
}

export function upstreamErrorCacheControl(status: number | string) {
  return typeof status === "number" && status >= 400 ? UPSTREAM_ERROR_CACHE_CONTROL : "no-store";
}

export const GET: APIRoute = async ({ request, url }) => {
  const originalUrl = url.searchParams.get("url") || "";
  const profile = imageProfile(url);
  const baseLog = {
    originalUrl,
    profile: profile.name
  };
  cacheLog("IMAGE_REQUEST_START", baseLog);

  const initialValidation = validateImageSourceUrl(originalUrl);
  if (!initialValidation.ok) {
    cacheLog("IMAGE_HOST_NOT_ALLOWED", {
      ...baseLog,
      host: initialValidation.host,
      error: initialValidation.error,
      warningCode: initialValidation.error
    });
    return jsonErrorResponse(imageHostErrorBody(initialValidation, profile.name, originalUrl), 400, VALIDATION_ERROR_CACHE_CONTROL);
  }

  const normalizedUrl = normalizedOriginalUrl(originalUrl);
  const candidates = imageCandidates(originalUrl);

  if (!normalizedUrl || !candidates.length) {
    return jsonErrorResponse({ error: "IMAGE_URL_INVALID", profile: profile.name, reason: "Invalid image URL" }, 400, VALIDATION_ERROR_CACHE_CONTROL);
  }

  const identity = cacheIdentity(profile, normalizedUrl);
  const cacheKeyHash = await sha256(identity);
  const key = await cacheKey(profile, identity);
  const edgeRequest = edgeCacheRequest(url, profile, identity);
  const ifNoneMatch = request.headers.get("if-none-match") || "";
  const requestLog = { ...baseLog, cacheKeyHash };

  cacheLog("IMAGE_URL_RESOLVED", {
    ...requestLog,
    candidateUrl: candidates[0],
    candidateIndex: 0,
    candidateCount: candidates.length,
    normalizedUrl,
    cacheIdentity: identity.startsWith("ophim:") ? "ophim-path" : "url"
  });

  const edgeHit = typeof caches !== "undefined" ? await caches.default.match(edgeRequest) : null;
  if (edgeHit) {
    cacheLog("IMAGE_CACHE_HIT", { ...requestLog, candidateUrl: candidates[0], cacheLayer: "edge" });
    const hit = new Response(edgeHit.body, edgeHit);
    hit.headers.set("X-Film-Bluesia-Net-Cache", "EDGE_HIT");
    cacheLog("IMAGE_RESPONSE_SENT", { ...requestLog, candidateUrl: candidates[0], status: hit.status, contentType: hit.headers.get("content-type") || "", cacheLayer: "edge" });
    return hit;
  }
  cacheLog("IMAGE_CACHE_MISS", { ...requestLog, candidateUrl: candidates[0], cacheLayer: "edge" });

  const cached = await readBinaryCache("images", key, imageCacheTtlSeconds());
  if (cached) {
    const cachedContentType = usableImageContentType(cached.contentType) || cached.contentType;
    if (originFallbackTooLarge(profile, cachedContentType, cached.body.byteLength)) {
      cacheLog("IMAGE_R2_MISS", {
        key,
        reason: "rejected-large-cached-origin",
        contentType: cached.contentType,
        profile: profile.name,
        bytes: cached.body.byteLength,
        maxBytes: profile.maxOriginFallbackBytes
      });
    } else {
    cacheLog("IMAGE_CACHE_HIT", { ...requestLog, candidateUrl: cached.sourceUrl, cacheLayer: "r2", contentType: cachedContentType, contentLength: cached.body.byteLength });
    if (cached.etag && ifNoneMatch.includes(cached.etag)) return notModified(cached.etag);
    const response = new Response(cached.body, {
      headers: imageHeaders({
        cacheStatus: "HIT",
        sourceUrl: cached.sourceUrl,
        profile: profile.name,
        etag: cached.etag,
        contentType: cachedContentType,
        transformStatus: imageTransformStatus(cachedContentType)
      })
    });
    await putEdgeCache(edgeRequest, response, { ...requestLog, candidateUrl: cached.sourceUrl, cacheLayer: "edge" });
    cacheLog("IMAGE_RESPONSE_SENT", { ...requestLog, candidateUrl: cached.sourceUrl, status: response.status, contentType: cachedContentType, contentLength: cached.body.byteLength, cacheLayer: "r2" });
    return response;
    }
  }
  cacheLog("IMAGE_CACHE_MISS", { ...requestLog, candidateUrl: candidates[0], cacheLayer: "r2" });

  let lastStatus: number | string = 0;

  for (const [candidateIndex, candidate] of candidates.entries()) {
    const attemptLog = { ...requestLog, candidateUrl: candidate, candidateIndex };
    try {
      cacheLog("IMAGE_CANDIDATE_ATTEMPT", { ...attemptLog, width: profile.width, quality: profile.quality });
      const fetched = await fetchAllowedImage(candidate, profile);
      if (fetched.rejection) {
        lastStatus = fetched.rejection.error;
        cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", { ...attemptLog, finalUrl: fetched.finalUrl, status: fetched.rejection.error, error: fetched.rejection.error, warningCode: fetched.rejection.error });
        continue;
      }
      if (fetched.redirectLimitExceeded || !fetched.response) {
        lastStatus = "redirect-limit-exceeded";
        cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", { ...attemptLog, finalUrl: fetched.finalUrl, status: lastStatus, error: lastStatus, warningCode: "IMAGE_REDIRECT_LIMIT_EXCEEDED" });
        continue;
      }

      const upstream = fetched.response;
      lastStatus = upstream.status;
      const contentType = usableImageContentType(upstream.headers.get("content-type") || "");
      const rawContentType = upstream.headers.get("content-type") || "";
      const contentLength = Number(upstream.headers.get("content-length") || 0);
      const originLog = { ...attemptLog, finalUrl: fetched.finalUrl, status: upstream.status, contentType: rawContentType, contentLength };
      if (upstream.status === 404) {
        cacheLog("IMAGE_UPSTREAM_NOT_FOUND", { ...originLog, warningCode: "IMAGE_UPSTREAM_NOT_FOUND" });
        continue;
      }
      if (!upstream.ok) {
        cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", { ...originLog, error: `upstream-status-${upstream.status}`, warningCode: "IMAGE_ORIGIN_ATTEMPT_FAIL" });
        continue;
      }
      if (!contentType) {
        cacheLog("IMAGE_UPSTREAM_NON_IMAGE", { ...originLog, warningCode: "IMAGE_UPSTREAM_NON_IMAGE" });
        continue;
      }

      cacheLog("IMAGE_ORIGIN_FETCH_DONE", originLog);
      if (contentLength && originTooLarge(profile, contentLength)) {
        lastStatus = `rejected-hard-origin:${contentLength}`;
        cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", {
          ...originLog,
          reason: "rejected-hard-origin-content-length",
          error: "IMAGE_ORIGIN_TOO_LARGE",
          warningCode: "IMAGE_ORIGIN_TOO_LARGE",
          maxOriginBytes: profile.maxOriginBytes,
          hardOriginBytes: profile.hardOriginBytes,
          targetOutputBytes: profile.targetOutputBytes
        });
        continue;
      }

      let responseForBody = upstream;
      let responseContentType = contentType;
      let responseFinalUrl = fetched.finalUrl;
      let responseTransformStatus = imageTransformStatus(contentType);

      try {
        const optimized = await fetchOptimizedImage(fetched.finalUrl, profile);
        const optimizedContentType = usableImageContentType(optimized.headers.get("content-type") || "");
        if (optimized.ok && optimizedContentType) {
          responseForBody = optimized;
          responseContentType = optimizedContentType;
          responseFinalUrl = optimized.url || fetched.finalUrl;
          responseTransformStatus = imageTransformStatus(optimizedContentType);
        } else {
          cacheLog("IMAGE_OPTIMIZE_FAIL", {
            ...originLog,
            optimizerStatus: optimized.status,
            optimizerContentType: optimized.headers.get("content-type") || "",
            warningCode: "IMAGE_OPTIMIZE_FAIL"
          });
        }
      } catch (error) {
        cacheLog("IMAGE_OPTIMIZE_FAIL", {
          ...originLog,
          error: error instanceof Error ? error.message : String(error),
          warningCode: "IMAGE_OPTIMIZE_FAIL"
        });
      }

      const body = new Uint8Array(await responseForBody.arrayBuffer());
      if (!body.byteLength) {
        cacheLog("IMAGE_OPTIMIZE_FAIL", { ...originLog, reason: "empty-body", warningCode: "IMAGE_EMPTY_BODY" });
        continue;
      }
      if (originTooLarge(profile, body.byteLength)) {
        lastStatus = `rejected-hard-origin:${body.byteLength}`;
        cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", {
          ...originLog,
          contentLength: body.byteLength,
          reason: "rejected-hard-origin",
          error: "IMAGE_ORIGIN_TOO_LARGE",
          warningCode: "IMAGE_ORIGIN_TOO_LARGE",
          maxOriginBytes: profile.maxOriginBytes,
          hardOriginBytes: profile.hardOriginBytes,
          targetOutputBytes: profile.targetOutputBytes
        });
        continue;
      }
      if (originFallbackTooLarge(profile, responseContentType, body.byteLength)) {
        lastStatus = `rejected-large-origin:${body.byteLength}`;
        cacheLog("IMAGE_OPTIMIZE_FAIL", {
          ...originLog,
          reason: "rejected-large-origin",
          bytes: body.byteLength,
          maxOriginFallbackBytes: profile.maxOriginFallbackBytes,
          targetOutputBytes: profile.targetOutputBytes,
          warningCode: "IMAGE_ORIGIN_FALLBACK_TOO_LARGE"
        });
        continue;
      }

      cacheLog("IMAGE_OPTIMIZE_SUCCESS", { ...originLog, contentType: responseContentType, contentLength: body.byteLength, selectedCandidateUrl: responseFinalUrl, transformStatus: responseTransformStatus });
      const { etag, skipped } = await writeBinaryCache("images", key, body, responseContentType, responseFinalUrl);
      if (!skipped) cacheLog("IMAGE_CACHE_PUT_SUCCESS", { ...originLog, contentLength: body.byteLength, cacheLayer: "r2" });
      if (ifNoneMatch && ifNoneMatch.includes(etag)) return notModified(etag);

      const response = new Response(body, {
        headers: imageHeaders({
          cacheStatus: skipped ? "BYPASS" : "MISS",
          sourceUrl: responseFinalUrl,
          profile: profile.name,
          etag,
          contentType: responseContentType,
          transformStatus: responseTransformStatus
        })
      });
      await putEdgeCache(edgeRequest, response, { ...originLog, cacheLayer: "edge" });
      cacheLog("IMAGE_RESPONSE_SENT", { ...originLog, status: response.status, contentType: responseContentType, contentLength: body.byteLength, selectedCandidateUrl: responseFinalUrl });
      return response;
    } catch (error) {
      cacheLog("IMAGE_ORIGIN_ATTEMPT_FAIL", { ...attemptLog, error: error instanceof Error ? error.message : String(error), warningCode: "IMAGE_ORIGIN_ATTEMPT_FAIL" });
      lastStatus = error instanceof Error ? error.message : String(error);
    }
  }

  const status = typeof lastStatus === "number" && lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502;
  return jsonErrorResponse({
    error: "IMAGE_UPSTREAM_UNAVAILABLE",
    profile: profile.name,
    status: lastStatus || "unknown",
    reason: "No allowed upstream image response was available"
  }, status, upstreamErrorCacheControl(status));
};
