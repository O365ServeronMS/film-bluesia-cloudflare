"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, ChevronDown, Clapperboard, Clock, ListVideo, Star, Users } from "lucide-react";
import { MovieActions } from "@/components/LocalMovieActions";
import { MovieCard } from "@/components/MovieCard";
import { MoviePlayer } from "@/components/MoviePlayer";
import { getMovie, getRecommendation } from "@/lib/catalog";
import { episodeWatchKey, findEpisodeByWatchKey } from "@/lib/episodes";
import {
  fallbackReturnToForSource,
  getBackHref,
  hrefWithReturnTo,
  inferNavSourceFromMovie,
  navSourceFromSearchParams,
  returnToFromSearchParams
} from "@/lib/navigation";
import { isMobilePlaybackUserAgent, normalizePlaybackUrl } from "@/lib/playback";
import type { MovieCard, MovieDetail } from "@/lib/types";
import { getDisplayRating, stripHtml } from "@/lib/utils";

const VIDSRC_HOSTS = new Set(["vsembed.ru", "vsembed.su", "vidsrc-embed.ru", "vidsrc-embed.su", "vidsrcme.su", "vsrc.su"]);
const MOBILE_VIDSRC_HOST = "vsembed.su";

function slugFromPath() {
  const match = window.location.pathname.match(/^\/movie\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function displayEpisodeServerName(serverName?: string) {
  const name = String(serverName || "").trim();
  return /^vietsub/i.test(name) ? "OPhim" : name || "Server";
}

function resolveEmbedUrl(src: string | undefined, params: URLSearchParams, mobileUA: boolean) {
  const normalized = normalizePlaybackUrl(src);
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (!VIDSRC_HOSTS.has(url.hostname)) return normalized;
    const mirror = String(params.get("mirror") || "").trim().toLowerCase();
    if (VIDSRC_HOSTS.has(mirror)) url.hostname = mirror;
    else if (mobileUA) url.hostname = MOBILE_VIDSRC_HOST;
    url.searchParams.set("autoplay", "0");
    return url.toString();
  } catch {
    return undefined;
  }
}

function toMovieCard(movie: MovieDetail): MovieCard {
  return {
    name: movie.name,
    originName: movie.originName,
    slug: movie.slug,
    poster: movie.poster,
    thumb: movie.thumb,
    year: movie.year,
    quality: movie.quality,
    lang: movie.lang,
    type: movie.type,
    status: movie.status,
    episodeCurrent: movie.episodeCurrent,
    time: movie.time,
    imdbRating: movie.imdbRating,
    tmdbRating: movie.tmdbRating,
    tmdb: movie.tmdb,
    imdb: movie.imdb,
    country: movie.country,
    category: movie.category
  };
}

function MovieDetailSkeleton() {
  return (
    <article>
      <div className="h-[420px] w-full animate-pulse bg-smoke" />
      <div className="space-y-3 px-4 pt-6">
        <div className="h-7 w-2/3 animate-pulse rounded bg-smoke" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-smoke" />
        <div className="h-12 w-40 animate-pulse rounded bg-smoke" />
      </div>
    </article>
  );
}

export function MovieDetailIsland() {
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [recommendations, setRecommendations] = useState<MovieCard[]>([]);
  const [error, setError] = useState(false);
  const [synopsisOpen, setSynopsisOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const slug = slugFromPath();
    if (!slug) {
      setError(true);
      return;
    }
    getMovie(slug)
      .then((data) => {
        if (!active) return;
        setMovie(data);
        document.title = `Bluesia Cinema - ${data.originName || data.name}`;
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  // Fire-and-forget recommendations ("Bạn cũng có thể thích"). Must not block render.
  useEffect(() => {
    const tmdbId = movie?.tmdb?.id;
    if (!tmdbId) return;
    let active = true;
    setRecommendations([]);
    getRecommendation(tmdbId, movie?.tmdb?.type)
      .then((items) => active && setRecommendations(items))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [movie?.tmdb?.id, movie?.tmdb?.type]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
        <p className="text-lg font-semibold text-ash-mist">Không thể tải phim. Vui lòng thử lại sau.</p>
      </div>
    );
  }

  if (!movie) return <MovieDetailSkeleton />;

  const params = new URLSearchParams(window.location.search);
  const requestedServerIndex = Number(params.get("server") || "0");
  const serverIndex = Number.isInteger(requestedServerIndex) && requestedServerIndex >= 0 ? requestedServerIndex : 0;
  const server = movie.episodes[serverIndex] || movie.episodes[0];
  const epKey = params.get("ep") || undefined;
  const episode = findEpisodeByWatchKey(server, epKey);
  const requestedPlayer = String(params.get("player") || "").toLowerCase();
  const preferredMode = requestedPlayer === "embed" ? "iframe" : requestedPlayer === "hls" ? "hls" : undefined;
  const mobileUA = isMobilePlaybackUserAgent(navigator.userAgent || "");
  const playerEmbed = resolveEmbedUrl(episode?.linkEmbed, params, mobileUA);
  const m3u8 = episode?.linkM3u8;
  const initialPlayerOpen = params.get("play") === "1";

  const heroImage = movie.poster || movie.thumb;
  const posterImage = movie.thumb || movie.poster;
  const playerPoster = movie.thumb || movie.poster || undefined;
  const displayRating = getDisplayRating(movie);
  const navSourceKey = navSourceFromSearchParams(params) || inferNavSourceFromMovie(movie);
  const returnTo = returnToFromSearchParams(params) || fallbackReturnToForSource(navSourceKey);
  const backHref = getBackHref(params, { source: navSourceKey, fallbackPath: "/" });
  const selectedEpisodeLabel = `${displayEpisodeServerName(server?.serverName)} · ${episode?.name || "Tập phim"}`;
  const movieCard = toMovieCard(movie);

  function selectEpisode(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Replace navigation so Back skips episode history and returns to the list.
    window.location.replace(href);
  }

  return (
    <article>
      <section className="relative overflow-hidden">
        {heroImage && (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-60"
            fetchPriority="high"
            loading="eager"
            decoding="async"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/30 via-obsidian/80 to-obsidian"></div>
        <div className="relative z-10 px-4 pb-4 pt-5">
          <a href={backHref} data-nav-back aria-label="Quay lại danh sách phim" className="grid h-11 w-11 place-items-center rounded-lg bg-obsidian/70 text-snow transition-colors hover:bg-smoke">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div className="mt-10 flex gap-4">
            <div className="w-36 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-smoke">
              {posterImage && (
                <img
                  src={posterImage}
                  alt={movie.name}
                  className="aspect-[2/3] h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  data-movie-poster
                  data-fallback-src={movie.poster || undefined}
                  data-original-src={posterImage || undefined}
                  data-placeholder-src="/image-placeholder.svg"
                />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-4">
              {displayRating && (
                <div className="mb-3 inline-flex items-center gap-1 rounded-[4.5px] bg-obsidian/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.083em] text-snow">
                  <Star className="h-3.5 w-3.5 fill-current" /> {displayRating.text}
                </div>
              )}
              <h1 className="text-heading font-bold leading-heading tracking-tight text-snow">{movie.name}</h1>
              <p className="mt-2 line-clamp-2 text-body text-ash-mist">{movie.originName}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-caption font-semibold uppercase tracking-caption text-iron-veil">
                {movie.year && <span className="inline-flex items-center gap-1 rounded-[4.5px] bg-snow/5 px-2.5 py-1"><Calendar className="h-3.5 w-3.5" /> {movie.year}</span>}
                {movie.time && <span className="inline-flex items-center gap-1 rounded-[4.5px] bg-snow/5 px-2.5 py-1"><Clock className="h-3.5 w-3.5" /> {movie.time}</span>}
                {movie.episodeCurrent && <span className="rounded-[4.5px] bg-snow/5 px-2.5 py-1">{movie.episodeCurrent}</span>}
                {movie.quality && <span className="rounded-[4.5px] bg-smoke/80 px-2.5 py-1 text-snow">{movie.quality}</span>}
              </div>
            </div>
          </div>
          <div id="player" className="mt-6 grid gap-3">
            <MoviePlayer
              embedSrc={playerEmbed}
              episodeLabel={selectedEpisodeLabel}
              hlsSrc={m3u8}
              initialOpen={initialPlayerOpen}
              movie={movieCard}
              poster={playerPoster}
              preferredMode={preferredMode}
              title={`${movie.name} - ${episode?.name || "Tập phim"}`}
            />
            <MovieActions movie={movieCard} />
          </div>
        </div>
      </section>

      <section className="px-4 pb-6">
        <div className="flex flex-wrap gap-2 text-caption font-semibold uppercase tracking-caption text-iron-veil">
          {movie.categoryList?.map((item) => <span key={`c-${item.slug}`} className="rounded-[4.5px] bg-snow/5 px-3 py-1.5">{item.name}</span>)}
          {movie.countryList?.map((item) => <span key={`n-${item.slug}`} className="rounded-[4.5px] bg-snow/5 px-3 py-1.5">{item.name}</span>)}
        </div>

        {movie.episodes.length ? (
          <div className="mt-4">
            <h2 className="inline-flex items-center gap-2 text-heading-sm font-bold text-snow"><ListVideo className="h-5 w-5 text-signal-blue" /> Danh sách tập phim</h2>
            {movie.episodes.map((episodeServer, episodeServerIndex) => (
              <div key={`srv-${episodeServerIndex}`} className="mt-4 rounded-lg border border-white/10 bg-smoke p-4">
                <h3 className="mb-3 text-body font-bold text-snow">{displayEpisodeServerName(episodeServer.serverName)}</h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {episodeServer.serverData.map((item, itemIndex) => {
                    const itemKey = episodeWatchKey(item, itemIndex);
                    const activeKey = episode ? episodeWatchKey(episode, server?.serverData.indexOf(episode) ?? 0) : "";
                    const active = episodeServerIndex === serverIndex && (itemKey === activeKey || (itemIndex === 0 && !epKey));
                    const episodeHref = hrefWithReturnTo(`/movie/${movie.slug}?server=${episodeServerIndex}&ep=${encodeURIComponent(itemKey)}&play=1#player`, returnTo, navSourceKey);
                    return (
                      <a
                        key={itemKey}
                        href={episodeHref}
                        onClick={(event) => selectEpisode(event, episodeHref)}
                        aria-current={active ? "true" : undefined}
                        className={active ? "rounded-[4.5px] bg-signal-blue px-3 py-2 text-center text-body font-bold text-snow" : "rounded-[4.5px] bg-obsidian px-3 py-2 text-center text-body font-bold text-snow transition-colors hover:bg-signal-blue/80"}
                      >{item.name || itemIndex + 1}</a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8 border-t border-white/10 pt-8">
          <h2 className="text-heading-sm font-bold text-snow">Nội dung phim</h2>
          <div className={`movie-synopsis mt-3${synopsisOpen ? " is-expanded" : ""}`} data-movie-synopsis>
            <p className="movie-synopsis-copy text-body leading-body-lg text-ash-mist">{stripHtml(movie.content) || "Chưa có mô tả."}</p>
            <button
              type="button"
              aria-expanded={synopsisOpen}
              onClick={() => setSynopsisOpen((open) => !open)}
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-body font-semibold text-glacier-beam transition-colors hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal-blue"
            >
              <span>{synopsisOpen ? "Thu gọn" : "Xem thêm"}</span>
              <ChevronDown className="movie-synopsis-icon h-4 w-4" />
            </button>
          </div>

          {(movie.actor?.length || movie.director?.length) ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {movie.actor?.length ? (
                <div className="rounded-lg border border-white/10 bg-smoke p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-body font-bold text-snow"><Users className="h-4 w-4 text-signal-blue" /> Diễn viên</h3>
                  <p className="text-body leading-body-lg text-ash-mist">{movie.actor.slice(0, 12).join(", ")}</p>
                </div>
              ) : null}
              {movie.director?.length ? (
                <div className="rounded-lg border border-white/10 bg-smoke p-4">
                  <h3 className="mb-3 inline-flex items-center gap-2 text-body font-bold text-snow"><Clapperboard className="h-4 w-4 text-signal-blue" /> Đạo diễn</h3>
                  <p className="text-body leading-body-lg text-ash-mist">{movie.director.slice(0, 8).join(", ")}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="px-4 pb-8">
          <h2 className="mb-4 text-heading-sm font-bold leading-heading-sm tracking-tight text-snow">Bạn cũng có thể thích</h2>
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {recommendations.map((rec) => (
              <div key={rec.slug} className="w-[132px] shrink-0 snap-start sm:w-[150px]">
                <MovieCard movie={rec} compact navSourceKey={navSourceKey} returnTo={returnTo} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
