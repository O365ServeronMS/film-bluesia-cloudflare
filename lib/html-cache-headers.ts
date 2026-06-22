export type HtmlCachePolicy = {
  browserMaxAge: number;
  sharedMaxAge: number;
  staleWhileRevalidate: number;
};

const MOVIE_PLAYBACK_PARAMS = ["server", "ep", "player", "mirror", "play"] as const;

function normalizedPath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

export function isMoviePlaybackVariantUrl(url: URL) {
  return /^\/movie\/[^/]+$/.test(normalizedPath(url.pathname)) &&
    MOVIE_PLAYBACK_PARAMS.some((key) => url.searchParams.has(key));
}

function storageCacheHeader(policy: HtmlCachePolicy) {
  return [
    "public",
    `max-age=${policy.browserMaxAge}`,
    `s-maxage=${policy.sharedMaxAge}`,
    `stale-while-revalidate=${policy.staleWhileRevalidate}`
  ].join(", ");
}

export function applyHtmlCacheStorageHeaders(response: Response, policy: HtmlCachePolicy) {
  response.headers.set("Cache-Control", storageCacheHeader(policy));
  response.headers.delete("CDN-Cache-Control");
  response.headers.delete("Cloudflare-CDN-Cache-Control");
  response.headers.append("Vary", "Accept-Encoding");
}

export function applyNoStoreHeaders(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
}
