"use client";

/* Suggestion thumbnails use the app-owned /api/image proxy. */
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { MovieCard } from "@/lib/types";
import { proxiedImage } from "@/lib/utils";

type SearchSuggestProps = {
  initialQuery?: string;
  autoFocus?: boolean;
};

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";

const MIN_QUERY_LENGTH = 2;
const SUGGESTION_LIMIT = 6;

export function SearchSuggest({ initialQuery = "", autoFocus = false }: SearchSuggestProps) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<MovieCard[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({ keyword: q, limit: String(SUGGESTION_LIMIT) });
        const res = await fetch("/api/ophim/search?" + params.toString(), {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });

        if (!res.ok) throw new Error("Search request failed");

        const data = await res.json() as { items?: MovieCard[] };
        const nextItems = Array.isArray(data.items) ? data.items.slice(0, SUGGESTION_LIMIT) : [];
        setItems(nextItems);
        setState(nextItems.length > 0 ? "ready" : "empty");
        setOpen(true);
      } catch {
        if (controller.signal.aborted) return;
        setItems([]);
        setState("error");
        setOpen(true);
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function changeQuery(nextQuery: string) {
    setQuery(nextQuery);
    if (nextQuery.trim().length < MIN_QUERY_LENGTH) {
      setItems([]);
      setState("idle");
    }
  }

  const showPanel = open && query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <form ref={rootRef} action="/search" method="get" onSubmit={() => setOpen(false)} className="relative min-w-0 flex-1">
      <label className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-zinc-300 shadow-sm">
        <Search className="h-5 w-5 shrink-0" />
        <input
          name="q"
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Tìm kiếm phim, diễn viên..."
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          autoFocus={autoFocus}
          autoComplete="off"
        />
      </label>

      {showPanel && (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#10131d] shadow-2xl shadow-black/50">
          {state === "loading" ? (
            <div className="px-4 py-3 text-sm text-zinc-400">Đang tìm...</div>
          ) : state === "ready" ? (
            <div className="max-h-[70vh] overflow-y-auto py-1">
              {items.map((movie) => (
                <a
                  key={movie.slug}
                  href={`/movie/${movie.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/10 focus:bg-white/10 focus:outline-none"
                >
                  <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    {movie.poster || movie.thumb ? (
                      <img src={proxiedImage(movie.poster || movie.thumb, "mobile")} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-semibold text-white">{movie.name}</span>
                    {movie.originName && <span className="mt-0.5 block truncate text-xs text-zinc-400">{movie.originName}</span>}
                    <span className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-zinc-400">
                      {movie.year && <span>{movie.year}</span>}
                      {movie.episodeCurrent && <span>{movie.episodeCurrent}</span>}
                      {movie.quality && <span>{movie.quality}</span>}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          ) : state === "empty" ? (
            <div className="px-4 py-3 text-sm text-zinc-400">Không có gợi ý phù hợp.</div>
          ) : state === "error" ? (
            <div className="px-4 py-3 text-sm text-zinc-400">Chưa tải được gợi ý.</div>
          ) : null}
        </div>
      )}
    </form>
  );
}
