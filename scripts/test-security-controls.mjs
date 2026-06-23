import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyHtmlCacheStorageHeaders, applyNoStoreHeaders, isMoviePlaybackVariantUrl } from "../lib/html-cache-headers.ts";
import { buildCachedImageUrl } from "../lib/image-cache.ts";
import { searchRateLimitResponse } from "../lib/search-rate-limit.ts";
import { setRuntimeEnv } from "../lib/runtime-env.ts";

const policy = { browserMaxAge: 0, sharedMaxAge: 1800, staleWhileRevalidate: 1800 };
const stored = new Response("cached");
applyHtmlCacheStorageHeaders(stored, policy);
assert.match(stored.headers.get("cache-control") || "", /s-maxage=1800/);
assert.equal(stored.headers.get("cdn-cache-control"), null);

const delivered = new Response(stored.body, stored);
applyNoStoreHeaders(delivered);
assert.equal(delivered.headers.get("cache-control"), "no-store");
assert.equal(delivered.headers.get("cdn-cache-control"), "no-store");
assert.equal(delivered.headers.get("cloudflare-cdn-cache-control"), "no-store");
console.log("HTML cache headers: internal storage is cacheable and client/CDN delivery is no-store");

assert.equal(isMoviePlaybackVariantUrl(new URL("https://film.bluesia.net/movie/test")), false);
for (const key of ["server", "ep", "player", "mirror", "play"]) {
  assert.equal(isMoviePlaybackVariantUrl(new URL(`https://film.bluesia.net/movie/test?${key}=1`)), true);
}
assert.equal(isMoviePlaybackVariantUrl(new URL("https://film.bluesia.net/list/phim-le?play=1")), false);
console.log("HTML cache lookup: every movie playback parameter bypasses lookup and write paths");

setRuntimeEnv({
  IMAGE_CACHE_BASE_URL: "https://img.bluesia.net",
  IMAGE_CACHE_SIGNING_SECRET: "test-only-secret"
});

const allowed = await buildCachedImageUrl("https://IMG.OPHIM.LIVE/uploads/movies/test.jpg", "m");
assert.match(allowed, /^https:\/\/img\.bluesia\.net\/i\/m\/[a-f0-9]{64}\.webp\?/);
assert.equal(new URL(allowed).searchParams.get("url"), "https://img.ophim.live/uploads/movies/test.jpg");

for (const blocked of [
  "https://httpbin.org/image/png",
  "http://img.ophim.live/uploads/movies/test.jpg",
  "https://user:pass@img.ophim.live/uploads/movies/test.jpg",
  "https://img.ophim.live:8443/uploads/movies/test.jpg",
  "https://img.ophim.live/uploads/movies/test.jpg#fragment",
  "https://127.0.0.1/test.jpg",
  "https://img.ophim.live/uploads/movies/video.m3u8",
  "https://img.ophim.live/uploads/movies/vector.svg"
]) {
  assert.equal(await buildCachedImageUrl(blocked, "m"), "", `${blocked} must not be signed`);
}
console.log("Image signer: arbitrary hosts and non-image URL forms are rejected");

let seenKey = "";
const request = new Request("https://film.bluesia.net/api/ophim/search?keyword=test", {
  headers: { "cf-connecting-ip": "203.0.113.10" }
});
const allowedSearch = await searchRateLimitResponse(request, {
  async limit({ key }) {
    seenKey = key;
    return { success: true };
  }
});
assert.equal(allowedSearch, null);
assert.equal(seenKey, "203.0.113.10");

const limitedSearch = await searchRateLimitResponse(request, {
  async limit() {
    return { success: false };
  }
});
assert.equal(limitedSearch?.status, 429);
assert.equal(limitedSearch?.headers.get("retry-after"), "60");
assert.equal(limitedSearch?.headers.get("cache-control"), "no-store");
assert.equal(limitedSearch?.headers.get("x-film-bluesia-rate-limit"), "limited");

const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const binding = wrangler.ratelimits?.find((item) => item.name === "SEARCH_RATE_LIMITER");
assert.deepEqual(binding?.simple, { limit: 60, period: 60 });
console.log("Search rate limit: binding and 429 response policy passed");

setRuntimeEnv(undefined);
