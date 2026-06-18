"use client";

import { KeyboardEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
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
  if (current.length || !legacyKey) return current;
  return readStoredRaw(legacyKey);
}

function addWeight(map: Map<string, number>, labels: Set<string>, weight: number) {
  labels.forEach((label) => {
    map.set(label, (map.get(label) || 0) + weight);
  });
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
  labels.forEach((label) => {
    score += map.get(label) || 0;
  });
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
    const refreshPersonalData = () => {
      setPersonalData({
        favorites: readStored(FAV_KEY, LEGACY_FAV_KEY),
        history: readStored(HISTORY_KEY, LEGACY_HISTORY_KEY)
      });
    };

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

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [slides.length, interactionTick]);

  if (!slides.length) return null;

  const visibleIndex = activeIndex < slides.length ? activeIndex : 0;
  const active = slides[visibleIndex];
  const activeReturnTo = "/";
  const activeImage = active.poster || active.thumb;
  const activeSigned = active.poster ? active.posterSigned : active.thumbSigned;
  
  let imageSrc = "";
  let imageSrcSet: string | undefined = undefined;
  let fallbackSrc: string | undefined = undefined;

  if (activeSigned?.m && activeSigned?.d) {
    imageSrc = activeSigned.d;
    imageSrcSet = `${activeSigned.m} 780w, ${activeSigned.d} 1280w`;
    fallbackSrc = activeSigned.d;
  } else if (activeImage) {
    imageSrc = activeImage;
    fallbackSrc = activeImage;
  }
  const displayRating = getDisplayRating(active);
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
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    moveSlide(deltaX < 0 ? 1 : -1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSlide(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSlide(1);
    }
  }

  return (
    <section className="bg-obsidian px-4 pb-6 pt-4">
      <div
        className="relative overflow-hidden bg-obsidian"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-roledescription="carousel"
        aria-label="Smart Spotlight"
      >
        <div key={active.slug} className="animate-[fadeIn_0.45s_ease-out]">
          <div className="relative mx-auto aspect-[2/3] h-[360px] overflow-hidden rounded-lg bg-smoke sm:h-[420px]">
            {activeImage ? (
              <img
                key={`${active.slug}-${activeImage}`}
                src={imageSrc}
                srcSet={imageSrcSet}
                sizes="(min-width: 640px) 280px, 240px"
                alt={active.name}
                loading={visibleIndex === 0 ? "eager" : "lazy"}
                fetchPriority={visibleIndex === 0 ? "high" : "auto"}
                decoding="async"
                data-movie-poster
                data-fallback-src={fallbackSrc}
                data-original-src={activeImage || undefined}
                data-placeholder-src="/image-placeholder.svg"
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          <div className="mx-auto flex max-w-[520px] flex-col items-center pt-5 text-center">
            {displayRating ? (
              <span className="inline-flex items-center gap-1.5 rounded-[4.5px] bg-[#f5c518] px-2.5 py-1 text-[11px] font-bold leading-none text-black">
                <span className="font-black tracking-[-0.04em]">IMDb</span>
                <span>{displayRating.score.toFixed(1)}</span>
              </span>
            ) : null}
            <h1 className="mt-3 line-clamp-2 text-heading-sm font-semibold leading-heading-sm text-snow sm:text-heading">
              {active.name}
            </h1>
            <p className="mt-1 line-clamp-1 text-body text-ash-mist">{active.originName || active.name}</p>
            <a
              href={hrefWithReturnTo(`/movie/${active.slug}`, activeReturnTo, "home")}
              className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-signal-blue px-6 py-3 text-[14px] font-bold uppercase tracking-[0.083em] text-snow transition-colors hover:bg-signal-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glacier-beam"
            >
              <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              Phát
            </a>
          </div>
        </div>

        {canNavigate && (
          <>
            <button
              type="button"
              aria-label="Spotlight trước"
              onClick={() => moveSlide(-1)}
              className="absolute left-3 top-[190px] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-lg bg-smoke text-snow transition-colors hover:bg-signal-blue focus:outline-none focus:ring-2 focus:ring-signal-blue sm:grid"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Spotlight tiếp theo"
              onClick={() => moveSlide(1)}
              className="absolute right-3 top-[190px] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-lg bg-smoke text-snow transition-colors hover:bg-signal-blue focus:outline-none focus:ring-2 focus:ring-signal-blue sm:grid"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
        {canNavigate ? (
          <div className="mt-4 flex items-center justify-center gap-1">
            {slides.map((movie, index) => (
              <button
                key={movie.slug}
                type="button"
                aria-label={"Chuyển tới " + movie.name}
                onClick={() => chooseSlide(index)}
                className="grid h-6 min-w-6 place-items-center rounded-full transition"
              >
                <span
                  className={index === visibleIndex ? "h-2 w-8 rounded-full bg-signal-blue transition-all" : "h-2 w-2 rounded-full bg-iron-veil transition-all hover:bg-snow"}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
