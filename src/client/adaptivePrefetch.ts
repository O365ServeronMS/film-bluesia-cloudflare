const STATS_KEY = "filmbluesia_nav_stats_v1";
const LAST_ROUTE_KEY = "filmbluesia_nav_last_route_v1";
const PREFETCHED_KEY = "filmbluesia_nav_prefetched_v1";
const MIN_TRANSITIONS = 5;
const MIN_PROBABILITY = 0.45;
const MAX_SOURCES = 24;
const MAX_TARGETS_PER_SOURCE = 8;
const SAFE_LIST_TYPES = new Set(["phim-le", "phim-bo", "tv-shows", "hoat-hinh", "phim-chieu-rap", "phim-moi-cap-nhat"]);
const SAFE_QUERY_KEYS = ["category", "country"] as const;
const UNSAFE_RESOURCE_PATTERN = /\.(m3u8|m4s|mp4|ts)(?:[?#]|$)|\/(?:hls|playback|player|embed|stream)(?:[/?#]|$)/i;

type NavStats = {
  version: 1;
  sources: Record<string, Record<string, number>>;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

let initialized = false;
let lastProcessedHref = "";
let prefetchedThisPageView = false;

function storageAvailable(storage: Storage) {
  try {
    const key = "__filmbluesia_storage_probe__";
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && storageAvailable(window.localStorage) && storageAvailable(window.sessionStorage);
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStats(): NavStats {
  const parsed = safeJsonParse<NavStats | null>(window.localStorage.getItem(STATS_KEY), null);
  if (!parsed || parsed.version !== 1 || typeof parsed.sources !== "object") {
    return { version: 1, sources: {} };
  }
  return parsed;
}

function writeStats(stats: NavStats) {
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage pressure or browser policy should not affect navigation.
  }
}

function normalizePathname(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return path || "/";
}

function safeSlug(value: string) {
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(slug) ? slug : "";
}

function normalizeRoute(pathname: string, search = "") {
  const path = normalizePathname(pathname);
  if (path === "/") return "/";
  if (path.startsWith("/movie/")) return "/movie";
  if (path.startsWith("/watch/")) return "/watch";
  if (path.startsWith("/search")) return "/search";
  if (path.startsWith("/favorites")) return "/favorites";
  if (path.startsWith("/history")) return "/history";
  if (path.startsWith("/settings")) return "/settings";

  const listMatch = path.match(/^\/list\/([^/?#]+)/);
  if (listMatch) {
    const type = safeSlug(listMatch[1] || "");
    if (!type) return "/list";
    const params = new URLSearchParams(search);
    const safeParams = new URLSearchParams();
    for (const key of SAFE_QUERY_KEYS) {
      const value = safeSlug(params.get(key) || "");
      if (value) safeParams.set(key, value);
    }
    const query = safeParams.toString();
    return query ? `/list/${type}?${query}` : `/list/${type}`;
  }

  return path.split("/").slice(0, 2).join("/") || "/";
}

function currentRoute() {
  return normalizeRoute(window.location.pathname, window.location.search);
}

function sortedEntries(entries: [string, number][]) {
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function pruneStats(stats: NavStats) {
  for (const [source, targets] of Object.entries(stats.sources)) {
    stats.sources[source] = Object.fromEntries(sortedEntries(Object.entries(targets)).slice(0, MAX_TARGETS_PER_SOURCE));
  }

  const sources = Object.entries(stats.sources);
  if (sources.length <= MAX_SOURCES) return stats;

  const rankedSources = sources
    .map(([source, targets]) => [source, Object.values(targets).reduce((sum, count) => sum + count, 0)] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_SOURCES)
    .map(([source]) => source);

  stats.sources = Object.fromEntries(rankedSources.map((source) => [source, stats.sources[source]]));
  return stats;
}

function recordTransition(route: string) {
  const previous = window.sessionStorage.getItem(LAST_ROUTE_KEY) || "";
  window.sessionStorage.setItem(LAST_ROUTE_KEY, route);
  if (!previous || previous === route) return;

  const stats = readStats();
  const targets = stats.sources[previous] || {};
  targets[route] = Math.min((targets[route] || 0) + 1, 9999);
  stats.sources[previous] = targets;
  writeStats(pruneStats(stats));
}

function predictNextRoute(route: string) {
  const targets = readStats().sources[route];
  if (!targets) return "";

  const entries = sortedEntries(Object.entries(targets));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total < MIN_TRANSITIONS) return "";

  const [bestRoute, bestCount] = entries[0] || ["", 0];
  return bestRoute && bestCount / total >= MIN_PROBABILITY ? bestRoute : "";
}

function shouldSkipForConnection() {
  const connection = (navigator as NavigatorWithConnection).connection;
  const effectiveType = connection?.effectiveType?.toLowerCase();
  return Boolean(connection?.saveData || effectiveType === "slow-2g" || effectiveType === "2g");
}

function routeToSafePrefetchUrls(route: string) {
  const [path, query = ""] = route.split("?");
  const listMatch = path.match(/^\/list\/([^/?#]+)$/);
  if (!listMatch) return [];

  const type = safeSlug(listMatch[1] || "");
  if (!SAFE_LIST_TYPES.has(type)) return [];

  const params = new URLSearchParams(query);
  params.set("page", "1");

  const htmlUrl = new URL(`/list/${type}`, window.location.origin);
  const apiUrl = new URL(`/api/ophim/list/${type}`, window.location.origin);
  for (const key of SAFE_QUERY_KEYS) {
    const value = safeSlug(params.get(key) || "");
    if (value) {
      htmlUrl.searchParams.set(key, value);
      apiUrl.searchParams.set(key, value);
    }
  }
  apiUrl.searchParams.set("page", "1");
  apiUrl.searchParams.set("limit", "30");
  return [htmlUrl.toString(), apiUrl.toString()].filter((url) => !UNSAFE_RESOURCE_PATTERN.test(url));
}

function readPrefetchedUrls() {
  return new Set(safeJsonParse<string[]>(window.sessionStorage.getItem(PREFETCHED_KEY), []));
}

function writePrefetchedUrls(urls: Set<string>) {
  try {
    window.sessionStorage.setItem(PREFETCHED_KEY, JSON.stringify(Array.from(urls).slice(-80)));
  } catch {
    // Dedupe is an optimization only.
  }
}

async function fetchQuietly(url: string) {
  try {
    await fetch(url, {
      cache: "force-cache",
      credentials: "same-origin",
      method: "GET"
    });
  } catch {
    // Prefetch failures must never surface to the page.
  }
}

async function prefetchPredictedRoute(route: string) {
  if (prefetchedThisPageView || shouldSkipForConnection()) return;

  const prediction = predictNextRoute(route);
  const urls = prediction ? routeToSafePrefetchUrls(prediction) : [];
  if (!urls.length) return;

  const prefetchedUrls = readPrefetchedUrls();
  const pendingUrls = urls.filter((url) => !prefetchedUrls.has(url));
  if (!pendingUrls.length) return;

  prefetchedThisPageView = true;
  for (const url of pendingUrls) {
    prefetchedUrls.add(url);
    await fetchQuietly(url);
  }
  writePrefetchedUrls(prefetchedUrls);
}

function scheduleIdle(callback: () => void) {
  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(callback, { timeout: 2500 });
    return;
  }
  window.setTimeout(callback, 1200);
}

function handlePageView() {
  if (!canUseStorage()) return;

  const href = window.location.pathname + window.location.search;
  if (href === lastProcessedHref) return;
  lastProcessedHref = href;
  prefetchedThisPageView = false;

  const route = currentRoute();
  recordTransition(route);
  scheduleIdle(() => {
    void prefetchPredictedRoute(route).catch(() => undefined);
  });
}

function afterPageLoad(callback: () => void) {
  if (document.readyState === "complete") {
    window.setTimeout(callback, 0);
    return;
  }
  window.addEventListener("load", callback, { once: true });
}

export function initAdaptivePrefetch() {
  if (initialized || typeof window === "undefined" || typeof document === "undefined") return;
  initialized = true;

  afterPageLoad(handlePageView);
  window.addEventListener("pageshow", handlePageView);
  window.addEventListener("astro:page-load", () => afterPageLoad(handlePageView));
}
