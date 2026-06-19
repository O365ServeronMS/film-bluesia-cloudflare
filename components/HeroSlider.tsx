"use client";

import { KeyboardEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import type { MovieCard } from "@/lib/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { baseSpotlightScore, normalizedLabelSet } from "@/lib/spotlight";
import { getDisplayRating } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;
const FAV_KEY = "film.bluesia.net:favorites";
const HISTORY_KEY = "film.bluesia.net:history";
const LEGACY_FAV_KEY = "bluesia:favorites";
const LEGACY_HISTORY_KEY = "bluesia:history";
const LOCAL_MOVIES_UPDATED_EVENT = "film.bluesia.net:local-movies-updated";
const LEGACY_LOCAL_MOVIES_UPDATED_EVENT = "bluesia:local-movies-updated";

type StoredMovie = MovieCard & { savedAt?: number };
type PersonalData = { favorites: StoredMovie[]; history: StoredMovie[] };
type PreferenceMap = {
  favoriteSlugs: Set<string>;
  watchedSlugs: Set<string>;
  country: Map<string, number>;
  category: Map<string, number>;
  type: Map<string, number>;
};

function readStoredRaw(key: string): StoredMovie[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((movie) => movie?.slug) : [];
  } catch {
    return [];
  }
}

function readStored(key: string, legacyKey?: string): StoredMovie[] {
  const current = readStoredRaw(key);
  return current.length || !legacyKey ? current : readStoredRaw(legacyKey);
}

function addWeight(map: Map<string, number>, labels: Set<string>, weight: number) {
  labels.forEach((label) => map.set(label, (map.get(label) || 0) + weight));
}

function buildPreferences(data: PersonalData | null): PreferenceMap | null {
  if (!data || (!data.favorites.length && !data.history.length)) return null;
  const prefs: PreferenceMap = {
    favoriteSlugs: new Set(data.favorites.map((movie) => movie.slug)),
    watchedSlugs: new Set(data.history.map((movie) => movie.slug)),
    country: new Map(),
    category: new Map(),
    type: new Map()
  };
  data.favorites.slice(0, 60).forEach((movie, index) => {
    const recency = Math.max(1, 1.35 - index * 0.02);
    addWeight(prefs.country, normalizedLabelSet(movie.country), 15 * recency);
    addWeight(prefs.category, normalizedLabelSet(movie.category), 13 * recency);
    addWeight(prefs.type, normalizedLabelSet(movie.type), 6 * recency);
  });
  data.history.slice(0, 80).forEach((movie, index) => {
    const recency = Math.max(0.4, 1.15 - index * 0.015);
    addWeight(prefs.country, normalizedLabelSet(movie.country), 7 * recency);
    addWeight(prefs.category, normalizedLabelSet(movie.category), 6 * recency);
    addWeight(prefs.type, normalizedLabelSet(movie.type), 3 * recency);
  });
  return prefs;
}

function matchingWeight(map: Map<string, number>, labels: Set<string>, cap: number) {
  let score = 0;
  labels.forEach((label) => { score += map.get(label) || 0; });
  return Math.min(cap, score);
}

function rankForUser(items: MovieCard[], data: PersonalData | null) {
  const prefs = buildPreferences(data);
  return [...items]
    .map((movie, index) => {
      let score = baseSpotlightScore(movie, [], index) + Math.max(0, items.length - index) * 0.8;
      if (prefs) {
        score += matchingWeight(prefs.country, normalizedLabelSet(movie.country), 34);
        score += matchingWeight(prefs.category, normalizedLabelSet(movie.category), 30);
        score += matchingWeight(prefs.type, normalizedLabelSet(movie.type), 12);
        if (prefs.favoriteSlugs.has(movie.slug)) score += 14;
        if (prefs.watchedSlugs.has(movie.slug) && !prefs.favoriteSlugs.has(movie.slug)) score -= 10;
      }
      return { movie, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.movie);
}

export function HeroSlider({ items }: { items: MovieCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [interactionTick, setInteractionTick] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const slides = useMemo(() => rankForUser(items.filter((movie) => movie.slug), personalData).slice(0, 8), [items, personalData]);

  useEffect(() => {
    const refreshPersonalData = () => setPersonalData({
      favorites: readStored(FAV_KEY, LEGACY_FAV_KEY),
      history: readStored(HISTORY_KEY, LEGACY_HISTORY_KEY)
    });
    refreshPersonalData();
    window.addEventListener("storage", refreshPersonalData);
    window.addEventListener("focus", refreshPersonalData);
    window.addEventListener(LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
    window.addEventListener(LEGACY_LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
    return () => {
      window.removeEventListener("storage", refreshPersonalData);
      window.removeEventListener("focus", refreshPersonalData);
      window.removeEventListener(LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
      window.removeEventListener(LEGACY_LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % slides.length), SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [slides.length, interactionTick]);

  if (!slides.length) return null;
  const visibleIndex = activeIndex < slides.length ? activeIndex : 0;
  const active = slides[visibleIndex];
  const activeImage = active.thumb || active.poster;
  const activeSigned = active.thumb ? active.thumbSigned : active.posterSigned;
  const imageSrc = activeSigned?.d || activeImage;
  const imageSrcSet = activeSigned?.m && activeSigned?.d ? `${activeSigned.m} 780w, ${activeSigned.d} 1280w` : undefined;
  const detailHref = hrefWithReturnTo(`/movie/${active.slug}`, "/", "home");
  const displayRating = getDisplayRating(active);
  const heroFormat = /trailer/i.test(active.episodeCurrent || "") ? "Trailer" : "HD";
  const canNavigate = slides.length > 1;

  function moveSlide(direction: 1 | -1) {
    if (!canNavigate) return;
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
    setInteractionTick((current) => current + 1);
  }

  function chooseSlide(index: number) {
    setActiveIndex(index);
    setInteractionTick((current) => current + 1);
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) >= Math.abs(deltaY) * 1.2) moveSlide(deltaX < 0 ? 1 : -1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveSlide(event.key === "ArrowLeft" ? -1 : 1);
  }

  return (
    <section className="hero-cinematic relative h-[510px] overflow-hidden bg-obsidian outline-none sm:h-[450px]" tabIndex={0} onKeyDown={handleKeyDown} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} aria-roledescription="carousel" aria-label="Smart Spotlight">
      <div key={active.slug} className="absolute inset-0 animate-[heroReveal_0.65s_ease-out]">
        {activeImage ? (
          <img src={imageSrc} srcSet={imageSrcSet} sizes="(min-width: 640px) 720px, 100vw" alt="" loading={visibleIndex === 0 ? "eager" : "lazy"} fetchPriority={visibleIndex === 0 ? "high" : "auto"} decoding="async" data-movie-poster data-fallback-src={activeSigned?.d} data-original-src={activeImage} data-placeholder-src="/image-placeholder.svg" className="h-full w-full object-cover object-center sm:object-[60%_center]" />
        ) : null}
      </div>
      <div className="hero-cinematic-overlay absolute inset-0" aria-hidden="true" />

      <div className="absolute inset-x-0 bottom-16 z-10 px-5 sm:bottom-14 sm:px-8">
        <div className="max-w-[430px]">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-snow/80">
            {active.year ? <span>{active.year}</span> : null}
            {displayRating ? <span className="rounded-[4.5px] bg-snow px-1.5 py-0.5 font-black tracking-normal text-black">IMDb {displayRating.score.toFixed(1)}</span> : null}
            <span>{heroFormat}</span>
          </div>
          <h1 className="mt-3 max-w-[390px] text-[36px] font-semibold leading-[0.98] tracking-[-0.035em] text-snow drop-shadow-lg sm:text-[48px]">{active.name}</h1>
          {active.originName && active.originName !== active.name ? <p className="mt-3 line-clamp-1 text-[13px] font-medium text-snow/80 sm:text-sm">{active.originName}</p> : null}
          <div className="mt-5 flex items-center gap-3">
            <a href={detailHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-snow px-5 py-2.5 text-[13px] font-bold text-obsidian transition hover:bg-snow/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"><Play className="h-4 w-4 fill-current" aria-hidden="true" />Xem phim</a>
            <a href={detailHref} aria-label={`Xem chi tiết ${active.name}`} className="grid h-11 w-11 place-items-center rounded-full border border-snow/35 bg-obsidian/35 text-snow backdrop-blur-sm transition hover:bg-snow hover:text-obsidian focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"><Info className="h-5 w-5" aria-hidden="true" /></a>
          </div>
        </div>
      </div>

      {canNavigate ? (
        <>
          <button type="button" aria-label="Spotlight trước" onClick={() => moveSlide(-1)} className="absolute left-3 top-[28%] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-obsidian/45 text-snow backdrop-blur-sm transition hover:bg-snow hover:text-obsidian focus:outline-none focus:ring-2 focus:ring-snow sm:grid"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" aria-label="Spotlight tiếp theo" onClick={() => moveSlide(1)} className="absolute right-3 top-[28%] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-obsidian/45 text-snow backdrop-blur-sm transition hover:bg-snow hover:text-obsidian focus:outline-none focus:ring-2 focus:ring-snow sm:grid"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute bottom-5 right-5 z-20 flex items-center gap-1.5 sm:right-8">
            {slides.map((movie, index) => (
              <button key={movie.slug} type="button" aria-label={`Chuyển tới ${movie.name}`} aria-current={index === visibleIndex ? "true" : undefined} onClick={() => chooseSlide(index)} className="grid h-6 min-w-4 place-items-center rounded-full"><span className={index === visibleIndex ? "h-1.5 w-6 rounded-full bg-snow transition-all" : "h-1.5 w-1.5 rounded-full bg-snow/40 transition-all hover:bg-snow"} /></button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
