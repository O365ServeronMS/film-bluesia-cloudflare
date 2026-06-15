import { allowedImageHostsForDiagnostics, imageSourceRegistry, validateImageSourceUrl } from "../lib/image-source-registry.ts";

const baseUrl = (process.env.OPHIM_BASE_URL || "https://ophim1.com").replace(/\/$/, "");
const page = Number(process.env.OPHIM_SCAN_PAGE || "1");
const endpoint = `${baseUrl}/danh-sach/phim-moi-cap-nhat?page=${page}`;

function collectMovies(payload) {
  const data = payload?.data || payload || {};
  return data.items || data.movies || payload?.items || payload?.movies || [];
}

function imageFields(movie) {
  return [
    movie?.poster_url,
    movie?.posterUrl,
    movie?.poster,
    movie?.thumb_url,
    movie?.thumbUrl,
    movie?.thumb,
    movie?.thumbnail,
    movie?.image_url,
    movie?.image
  ].filter(Boolean);
}

function hostname(value, cdn) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).hostname.toLowerCase();
    const base = String(cdn || "https://img.ophim.live/uploads/movies").replace(/\/$/, "");
    return new URL(`${base}/${raw.replace(/^\/+/, "")}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const response = await fetch(endpoint, {
  headers: {
    "user-agent": "film.bluesia.net image host diagnostic"
  }
});

if (!response.ok) {
  throw new Error(`OPhim latest fetch failed: ${response.status}`);
}

const payload = await response.json();
const cdn = payload?.APP_DOMAIN_CDN_IMAGE || payload?.data?.APP_DOMAIN_CDN_IMAGE || "";
const hosts = new Map();

for (const movie of collectMovies(payload)) {
  for (const value of imageFields(movie)) {
    const host = hostname(value, cdn);
    if (!host) continue;
    const list = hosts.get(host) || [];
    if (list.length < 5) list.push(movie?.slug || movie?.name || "unknown");
    hosts.set(host, list);
  }
}

const registry = imageSourceRegistry();
const allowed = [];
const trustedSuffix = [];
const unknown = [];

for (const [host, examples] of [...hosts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const url = `https://${host}/uploads/movies/example.jpg`;
  const result = validateImageSourceUrl(url, registry);
  const row = { host, examples };
  if (result.ok) {
    allowed.push(row);
  } else if (registry.allowedSuffixes.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)) {
    trustedSuffix.push(row);
  } else {
    unknown.push(row);
  }
}

console.log(JSON.stringify({
  endpoint,
  registry: allowedImageHostsForDiagnostics(registry),
  counts: {
    totalHosts: hosts.size,
    allowed: allowed.length,
    trustedSuffix: trustedSuffix.length,
    unknown: unknown.length
  },
  allowed,
  trustedSuffix,
  unknown
}, null, 2));
