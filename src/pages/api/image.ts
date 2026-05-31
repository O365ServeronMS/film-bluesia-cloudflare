import type { APIRoute } from "astro";
import { imageCacheTtlSeconds, readBinaryCache, writeBinaryCache } from "@/lib/cache";

const FALLBACK_IMAGE_ROOTS = ["https://img.ophim.live", "https://img.ophim.cc"];
const VARIANTS = [
  { width: 360, quality: 60 },
  { width: 720, quality: 70 },
  { width: 960, quality: 72 }
] as const;
const IMAGE_STALE_WHILE_REVALIDATE_SECONDS = 86400;

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function approvedVariant(width: number, quality: number) {
  const requestedWidth = Math.max(1, width);
  const closest = VARIANTS.reduce((best, candidate) =>
    Math.abs(candidate.width - requestedWidth) < Math.abs(best.width - requestedWidth) ? candidate : best
  );
  return {
    width: closest.width,
    quality: Math.min(95, Math.max(40, Number.isFinite(quality) ? Math.round(quality) : closest.quality))
  };
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function cacheLog(message: string, details?: Record<string, unknown>) {
  console.log(`[cache] ${message}`, details || {});
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function imageType(value: string | null) {
  const type = String(value || "poster").trim().toLowerCase();
  return ["poster", "backdrop", "thumb"].includes(type) ? type : "poster";
}

function imageVariant(width: number) {
  return width <= 360 ? "iphone" : "desktop";
}

function negotiatedFormat(request: Request) {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "jpeg";
}

function imageCandidates(imageUrl: string) {
  const url = safeUrl(imageUrl);
  if (!url) return [];

  const candidates = [url.toString()];
  const fileName = url.pathname.split("/").filter(Boolean).pop();
  const isOphimImage = /(^|\.)ophim\./i.test(url.hostname) || url.hostname.startsWith("img.");

  if (isOphimImage && fileName) {
    const existingPath = url.pathname.startsWith("/uploads/movies/")
      ? url.pathname
      : `/uploads/movies/${fileName}`;
    candidates.push(`${url.origin}${existingPath}`);
    for (const root of FALLBACK_IMAGE_ROOTS) {
      candidates.push(`${root}${existingPath}`);
      candidates.push(`${root}/uploads/movies/${fileName}`);
    }
  }

  return unique(candidates);
}

async function cacheKey(imageUrl: string, type: string, width: number, format: string) {
  return `images/${type}/${await sha256(imageUrl)}/${imageVariant(width)}.${format}`;
}

function imageHeaders(options: {
  contentType: string;
  cacheStatus: "HIT" | "MISS" | "BYPASS" | "FALLBACK";
  sourceUrl?: string;
  transformed: boolean;
  etag?: string;
}) {
  const ttl = imageCacheTtlSeconds();
  const cacheControl = `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${IMAGE_STALE_WHILE_REVALIDATE_SECONDS}`;
  return {
    "Content-Type": options.contentType,
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Cloudflare-CDN-Cache-Control": cacheControl,
    "X-Film-Bluesia-Net-Cache": options.cacheStatus,
    "X-Film-Bluesia-Net-Cache-Type": "image",
    "X-Film-Bluesia-Net-Image-Format": "auto",
    "X-Film-Bluesia-Net-Image-Transformed": options.transformed ? "1" : "0",
    "X-Film-Bluesia-Net-Image-Variant": "cloudflare-free",
    "Vary": "Accept",
    ...(options.etag ? { "ETag": `"${options.etag}"` } : {}),
    ...(options.sourceUrl ? { "X-Film-Bluesia-Net-Image-Source": options.sourceUrl } : {})
  };
}

function notModified(etag: string) {
  const ttl = imageCacheTtlSeconds();
  const cacheControl = `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${IMAGE_STALE_WHILE_REVALIDATE_SECONDS}`;
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

async function fetchImage(url: string, variant: { width: number; quality: number }, transform: boolean) {
  const init: RequestInit & { cf?: { image?: { width: number; quality: number; format: "auto" } } } = {
    headers: {
      "User-Agent": "Mozilla/5.0 (film.bluesia.net; Cloudflare free image proxy)",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Referer": process.env.OPHIM_BASE_URL || "https://ophim1.com/"
    },
    cache: "no-store"
  };

  if (transform) {
    init.cf = { image: { width: variant.width, quality: variant.quality, format: "auto" } };
  }

  return fetch(url, init);
}

export const GET: APIRoute = async ({ request, url }) => {
  const rawUrl = url.searchParams.get("url") || "";
  const imageUrl = decodeURIComponent(rawUrl);
  const type = imageType(url.searchParams.get("type"));
  const requestedWidth = numberParam(url.searchParams.get("w"), 720);
  const requestedQuality = numberParam(url.searchParams.get("q"), 70);
  const variant = approvedVariant(requestedWidth, requestedQuality);
  const format = negotiatedFormat(request);
  const candidates = imageCandidates(imageUrl);

  if (!candidates.length) {
    return Response.json({ error: "Invalid image URL" }, { status: 400 });
  }

  const key = await cacheKey(imageUrl, type, variant.width, format);
  const ifNoneMatch = request.headers.get("if-none-match") || "";
  const cached = await readBinaryCache("images", key, imageCacheTtlSeconds());
  if (cached) {
    if (cached.etag && ifNoneMatch.includes(cached.etag)) return notModified(cached.etag);
    return new Response(cached.body, {
      headers: imageHeaders({
        contentType: cached.contentType,
        cacheStatus: "HIT",
        sourceUrl: cached.sourceUrl,
        transformed: true,
        etag: cached.etag
      })
    });
  }

  let lastStatus = 0;

  for (const candidate of candidates) {
    for (const transform of [true, false]) {
      try {
        cacheLog("IMAGE_ORIGIN_FETCH", { sourceUrl: candidate, width: variant.width, quality: variant.quality, transform });
        const upstream = await fetchImage(candidate, variant, transform);
        lastStatus = upstream.status;
        const contentType = upstream.headers.get("content-type") || "";
        if (!upstream.ok || !contentType.toLowerCase().startsWith("image/")) continue;

        const body = new Uint8Array(await upstream.arrayBuffer());
        cacheLog(transform ? "IMAGE_OPTIMIZE_OK" : "IMAGE_OPTIMIZE_FAIL", { sourceUrl: candidate, contentType, bytes: body.byteLength });
        const { etag, skipped } = await writeBinaryCache("images", key, body, contentType, candidate);
        if (ifNoneMatch && ifNoneMatch.includes(etag)) return notModified(etag);

        return new Response(body, {
          headers: imageHeaders({
            contentType,
            cacheStatus: skipped ? "BYPASS" : transform ? "MISS" : "FALLBACK",
            sourceUrl: candidate,
            transformed: transform,
            etag
          })
        });
      } catch {
        cacheLog("IMAGE_OPTIMIZE_FAIL", { sourceUrl: candidate, transform });
        continue;
      }
    }
  }

  cacheLog("IMAGE_FALLBACK_PLACEHOLDER", { imageUrl, status: lastStatus || "unknown" });
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540"><rect width="360" height="540" fill="#18181b"/><text x="180" y="270" fill="#71717a" font-family="Arial,sans-serif" font-size="22" text-anchor="middle">No image</text></svg>`,
    {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "X-Film-Bluesia-Net-Cache": "FALLBACK",
        "X-Film-Bluesia-Net-Cache-Type": "image"
      }
    }
  );
};
