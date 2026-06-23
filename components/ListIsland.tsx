import { useState, useEffect } from "react";
import { MovieCard } from "./MovieCard";
import { TopBar } from "./TopBar";
import { Pagination } from "./Pagination";
import type { MovieListPayload, SourceLabel } from "@/lib/types";

const typeToSnapshotKey: Record<string, string> = {
  "phim-moi-cap-nhat": "list-latest",
  "phim-le": "list-single",
  "phim-bo": "list-series",
  "tv-shows": "list-tvshows",
  "hoat-hinh": "list-hoathinh"
};

const quickCountries = [
  { label: "Âu Mỹ", slug: "au-my" },
  { label: "Hàn Quốc", slug: "han-quoc" }
];
const quickCategories = [{ label: "Phim chiếu rạp", slug: "phim-chieu-rap" }];
const countryFilterableTypes = new Set(["phim-le", "phim-bo", "tv-shows"]);
const categoryFilterableTypes = new Set(["phim-le"]);

function safeFilterSlug(value: string | null | undefined) {
  const slug = String(value || "").trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function normalizeTaxonomy(items: SourceLabel[]) {
  return items.flatMap((item) => {
    const name = String(item?.name || "").trim();
    const slug = safeFilterSlug(item?.slug);
    return name && slug ? [{ name, slug }] : [];
  });
}

export function ListIsland({ type, returnTo }: { type: string; returnTo: string }) {
  const [data, setData] = useState<MovieListPayload | null>(null);
  const [countries, setCountries] = useState<SourceLabel[]>([]);
  const [categories, setCategories] = useState<SourceLabel[]>([]);
  const [visibleItems, setVisibleItems] = useState<number>(12);
  const [error, setError] = useState(false);
  
  // URL state
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const requestedCountry = safeFilterSlug(searchParams.get("country"));
  const requestedCategory = safeFilterSlug(searchParams.get("category"));

  const supportsCountryFilter = countryFilterableTypes.has(type);
  const supportsCategoryFilter = categoryFilterableTypes.has(type);
  
  useEffect(() => {
    async function loadData() {
      try {
        const baseUrl = import.meta.env.PUBLIC_SNAPSHOT_BASE_URL;
        let listData: MovieListPayload | null = null;
        let cData: SourceLabel[] = [];
        let catData: SourceLabel[] = [];
        
        // Only use snapshot if page 1 and no filters
        const canUseSnapshot = page === 1 && !requestedCountry && !requestedCategory;
        const snapshotKey = typeToSnapshotKey[type];
        
        let manifest: any = null;
        if (baseUrl && (canUseSnapshot || supportsCountryFilter || supportsCategoryFilter)) {
          try {
            const manifestRes = await fetch(`${baseUrl}/manifest/latest.json`, { cache: "no-store" });
            if (manifestRes.ok) manifest = await manifestRes.json();
          } catch (err) {
            console.warn("[ListIsland] Manifest fetch failed", err);
          }
        }

        const promises = [];

        // 1. Fetch List Data
        if (canUseSnapshot && manifest && snapshotKey && manifest.snapshots?.[snapshotKey]?.hash) {
          promises.push(
            fetch(`${baseUrl}/${snapshotKey}/${manifest.snapshots[snapshotKey].hash}.json`, { cache: "force-cache" })
              .then(res => {
                if (!res.ok) throw new Error("List snapshot failed");
                return res.json();
              })
              .then(json => { listData = json; })
              .catch(err => {
                console.warn("[ListIsland] List snapshot fallback", err);
                return fetch(`/api/ophim/list/${type}?page=${page}&country=${requestedCountry}&category=${requestedCategory}`)
                  .then(res => {
                    if (!res.ok) throw new Error("List API failed");
                    return res.json();
                  })
                  .then(json => { listData = json; });
              })
          );
        } else {
          promises.push(
            fetch(`/api/ophim/list/${type}?page=${page}&country=${requestedCountry}&category=${requestedCategory}`)
              .then(res => {
                if (!res.ok) throw new Error("List API failed");
                return res.json();
              })
              .then(json => { listData = json; })
          );
        }

        // 2. Fetch Countries
        if (supportsCountryFilter) {
          if (manifest && manifest.snapshots?.countries?.hash) {
            promises.push(
              fetch(`${baseUrl}/countries/${manifest.snapshots.countries.hash}.json`, { cache: "force-cache" })
                .then(res => res.ok ? res.json() : fetch("/api/ophim/countries").then(r => r.json()))
                .then(json => { cData = normalizeTaxonomy(json); })
                .catch(() => {})
            );
          } else {
            promises.push(fetch("/api/ophim/countries").then(r => r.json()).then(json => { cData = normalizeTaxonomy(json); }).catch(() => {}));
          }
        }

        // 3. Fetch Categories
        if (supportsCategoryFilter) {
          if (manifest && manifest.snapshots?.categories?.hash) {
            promises.push(
              fetch(`${baseUrl}/categories/${manifest.snapshots.categories.hash}.json`, { cache: "force-cache" })
                .then(res => res.ok ? res.json() : fetch("/api/ophim/categories").then(r => r.json()))
                .then(json => { catData = normalizeTaxonomy(json); })
                .catch(() => {})
            );
          } else {
            promises.push(fetch("/api/ophim/categories").then(r => r.json()).then(json => { catData = normalizeTaxonomy(json); }).catch(() => {}));
          }
        }

        await Promise.all(promises);
        
        if (!listData) throw new Error("No list data loaded");
        setData(listData);
        setCountries(cData);
        setCategories(catData);
      } catch (err) {
        console.error("[ListIsland] Failed to load", err);
        setError(true);
      }
    }
    
    loadData();
  }, [type, page, requestedCountry, requestedCategory, supportsCategoryFilter, supportsCountryFilter]);

  useEffect(() => {
    if (data && visibleItems < data.items.length) {
      const timer = window.setTimeout(() => {
        setVisibleItems((prev) => prev + 12);
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [data, visibleItems]);

  if (error) {
    return (
      <>
        <TopBar />
        <div className="flex min-h-[50vh] items-center justify-center px-4 text-center">
          <p className="text-ash-mist font-semibold text-lg">Không thể tải danh sách phim. Vui lòng thử lại sau.</p>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopBar />
        <section className="px-4 pt-5">
          <div className="h-8 w-64 rounded bg-smoke animate-pulse" />
        </section>
        <section className="grid grid-cols-3 gap-3 px-4 pt-5 sm:grid-cols-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-[4.5px] bg-smoke animate-pulse" />
          ))}
        </section>
      </>
    );
  }

  const isQuickCountry = quickCountries.some(c => c.slug === requestedCountry);
  const isQuickCategory = quickCategories.some(c => c.slug === requestedCategory);
  const country = countries.some((item) => item.slug === requestedCountry) || isQuickCountry ? requestedCountry : "";
  const category = categories.some((item) => item.slug === requestedCategory) || isQuickCategory ? requestedCategory : "";
  const currentPage = data.page || page;
  const totalPages = data.totalPages;
  const activeFilters = { country, category };

  const typeTitles: Record<string, string> = {
    "phim-moi-cap-nhat": "Phim mới cập nhật",
    "phim-le": "Phim lẻ",
    "phim-bo": "Phim bộ",
    "tv-shows": "TV Show",
    "hoat-hinh": "Hoạt hình"
  };
  const activeCountryName = countries.find((item) => item.slug === country)?.name || quickCountries.find((c) => c.slug === country)?.label;
  const activeCategoryName = categories.find((item) => item.slug === category)?.name || quickCategories.find((c) => c.slug === category)?.label;
  const displayTitle = [typeTitles[type] || data.title, activeCountryName, activeCategoryName].filter(Boolean).join(" · ");

  function listHref(nextPage: number, filters = activeFilters) {
    const query = new URLSearchParams({ page: String(Math.max(1, nextPage)) });
    if (filters.country) query.set("country", filters.country);
    if (filters.category) query.set("category", filters.category);
    return `/list/${type}?${query.toString()}`;
  }

  return (
    <>
      <TopBar />
      <section className="px-4 pt-5">
        <h1 className="text-heading-sm font-bold leading-heading-sm text-snow">{displayTitle}</h1>
      </section>

      {(supportsCountryFilter || supportsCategoryFilter) && (
        <section className="px-4 pt-3" aria-label="Lọc nhanh">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <a href={listHref(1, { country: "", category: "" })} aria-current={!country && !category ? "true" : undefined} className={`whitespace-nowrap rounded-[4.5px] border px-3 py-1.5 text-caption font-bold tracking-caption transition-colors ${!country && !category ? "border-signal-blue bg-signal-blue text-snow" : "border-white/10 bg-smoke text-ash-mist hover:text-snow"}`}>Tất cả</a>
            {supportsCountryFilter && quickCountries.map((item) => (
              <a key={item.slug} href={listHref(1, { ...activeFilters, country: item.slug })} aria-current={country === item.slug ? "true" : undefined} className={`whitespace-nowrap rounded-[4.5px] border px-3 py-1.5 text-caption font-bold tracking-caption transition-colors ${country === item.slug ? "border-signal-blue bg-signal-blue text-snow" : "border-white/10 bg-smoke text-ash-mist hover:text-snow"}`}>{item.label}</a>
            ))}
            {supportsCategoryFilter && quickCategories.map((item) => (
              <a key={item.slug} href={listHref(1, { ...activeFilters, category: item.slug })} aria-current={category === item.slug ? "true" : undefined} className={`whitespace-nowrap rounded-[4.5px] border px-3 py-1.5 text-caption font-bold tracking-caption transition-colors ${category === item.slug ? "border-signal-blue bg-signal-blue text-snow" : "border-white/10 bg-smoke text-ash-mist hover:text-snow"}`}>{item.label}</a>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-3 px-4 pt-5 sm:grid-cols-4">
        {data.items.slice(0, visibleItems || 12).map((movie) => (
          <MovieCard key={movie.slug} movie={movie} compact headingLevel={2} navSourceKey={type} returnTo={returnTo} />
        ))}
      </section>

      {visibleItems >= data.items.length && (
        <Pagination 
          className="px-4" 
          currentPage={currentPage} 
          totalPages={totalPages} 
          buildUrl={(p) => listHref(p)} 
        />
      )}

      {visibleItems >= data.items.length && (countries.length > 0 || categories.length > 0) ? (
        <section className="mx-4 mt-8 border-t border-white/10 pb-8 pt-6" aria-labelledby="all-filter-tags">
          <div className="flex items-center justify-between gap-3">
            <h2 id="all-filter-tags" className="text-caption font-bold uppercase tracking-caption text-iron-veil">Khám phá theo thẻ</h2>
            {(country || category) && <a href={listHref(1, { country: "", category: "" })} className="text-caption font-bold text-glacier-beam hover:text-snow">Xóa bộ lọc</a>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {countries.map((item) => (
              <a key={item.slug} href={listHref(1, { ...activeFilters, country: item.slug })} aria-current={country === item.slug ? "true" : undefined} className={`rounded-[4.5px] border px-2.5 py-1.5 text-caption font-semibold transition-colors ${country === item.slug ? "border-signal-blue text-glacier-beam" : "border-white/10 text-iron-veil hover:border-white/20 hover:text-snow"}`}>{item.name}</a>
            ))}
            {categories.map((item) => (
              <a key={item.slug} href={listHref(1, { ...activeFilters, category: item.slug })} aria-current={category === item.slug ? "true" : undefined} className={`rounded-[4.5px] border px-2.5 py-1.5 text-caption font-semibold transition-colors ${category === item.slug ? "border-signal-blue text-glacier-beam" : "border-white/10 text-iron-veil hover:border-white/20 hover:text-snow"}`}>{item.name}</a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
