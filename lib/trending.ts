import { readJsonCache, writeJsonCache } from "@/lib/cache";

const TMDB_TRENDING_URL = "https://api.themoviedb.org/3/trending/all/week?language=en-US";
const TRENDING_NAMESPACE = "metadata-trending";
const TRENDING_KEY = "tmdb:trending:week";
const TRENDING_TTL_SECONDS = 60 * 60 * 6;

type TrendingItem = { id?: string | number; media_type?: string };
type TrendingPayload = { results?: TrendingItem[] };

export async function refreshTrendingMovies(token?: string) {
  const apiToken = String(token || "").trim();
  if (!apiToken) return { skipped: true, reason: "missing-token" };

  const res = await fetch(TMDB_TRENDING_URL, {
    headers: { Authorization: `Bearer ${apiToken}`, accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`TMDB trending request failed ${res.status}`);
  }

  const data = await res.json() as TrendingPayload;
  const ids = Array.isArray(data?.results)
    ? Array.from(new Set(
        data.results
          .filter((item) => item?.media_type === "movie" || item?.media_type === "tv")
          .map((item) => String(item?.id))
          .filter((id) => id && id !== "undefined")
      ))
    : [];

  await writeJsonCache(TRENDING_NAMESPACE, TRENDING_KEY, ids, TMDB_TRENDING_URL, TRENDING_TTL_SECONDS, { critical: true });
  return { skipped: false, count: ids.length };
}

export async function getTrendingTmdbIds(): Promise<Set<string>> {
  const ids = await readJsonCache<string[]>(TRENDING_NAMESPACE, TRENDING_KEY, TRENDING_TTL_SECONDS, true);
  return new Set(Array.isArray(ids) ? ids : []);
}
