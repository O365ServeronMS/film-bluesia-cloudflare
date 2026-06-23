import { Heart } from "lucide-react";
import type { MovieCard as MovieCardType } from "@/lib/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { getDisplayRating } from "@/lib/utils";

const LOCAL_IMAGE_PLACEHOLDER = "/image-placeholder.svg";

function validHttpImage(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function movieStatus(movie: MovieCardType) {
  const episode = String(movie.episodeCurrent || "").trim();
  if (/trailer/i.test(episode)) return "TRAILER";

  const episodeMatch = episode.match(/t(?:ập|ap)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (episodeMatch) return `TẬP ${episodeMatch[1]}`;

  return /(?:^|\b)(?:f?hd)(?:\b|$)/i.test(String(movie.quality || "")) ? "HD" : "";
}

export function MovieCard({
  movie,
  compact = false,
  headingLevel = 3,
  priority = false,
  navSourceKey = "",
  returnTo = ""
}: {
  movie: MovieCardType;
  compact?: boolean;
  headingLevel?: 2 | 3;
  priority?: boolean;
  navSourceKey?: string;
  returnTo?: string;
}) {
  const primaryUrl = validHttpImage(movie.thumb) || validHttpImage(movie.poster);
  const fallbackUrl = validHttpImage(movie.poster) || validHttpImage(movie.thumb);
  
  let fallbackImage = "";
  if (movie.posterSigned?.d && movie.posterSigned.d !== movie.thumbSigned?.d) {
    fallbackImage = movie.posterSigned.d;
  } else if (fallbackUrl && fallbackUrl !== primaryUrl) {
    fallbackImage = fallbackUrl;
  }

  let imageSrc = LOCAL_IMAGE_PLACEHOLDER;
  if (movie.thumbSigned?.m && movie.thumbSigned?.d) {
    imageSrc = movie.thumbSigned.d;
  } else if (primaryUrl) {
    imageSrc = primaryUrl;
  }
  const imageClassName = "h-full w-full object-cover transition duration-500 group-hover:scale-105";
  const Title = headingLevel === 2 ? "h2" : "h3";
  const displayRating = getDisplayRating(movie);
  const status = movieStatus(movie);
  const detailHref = hrefWithReturnTo(`/movie/${movie.slug}`, returnTo, navSourceKey);

  return (
    <a href={detailHref} className="group block min-w-0">
      <article className="overflow-hidden rounded-lg bg-smoke transition duration-300">
        <div className="relative aspect-[2/3] overflow-hidden bg-obsidian">
          <picture>
            {movie.thumbSigned?.m && movie.thumbSigned?.d ? (
              <>
                <source media="(max-width: 767px)" srcSet={movie.thumbSigned.m} />
                <source media="(min-width: 768px)" srcSet={movie.thumbSigned.d} />
              </>
            ) : null}
            <img
              src={imageSrc}
              alt={movie.name}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : undefined}
              decoding="async"
              data-movie-poster
              data-fallback-src={fallbackImage || undefined}
              data-original-src={primaryUrl || undefined}
              data-placeholder-src={LOCAL_IMAGE_PLACEHOLDER}
              className={imageClassName}
            />
          </picture>
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            {displayRating ? (
              <span className="inline-flex min-h-5 items-center rounded-[4.5px] bg-[#f5c518] px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.04em] text-black">
                {displayRating.text}
              </span>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="grid h-7 w-7 place-items-center rounded-full bg-obsidian/75 text-snow">
              <Heart className="h-3.5 w-3.5" />
            </span>
          </div>
          {status && (
            <span className="absolute bottom-2 left-2 inline-flex min-h-6 items-center rounded-[4.5px] bg-signal-blue px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.083em] text-snow">
              {status}
            </span>
          )}
        </div>
        <div className="p-3">
          <Title className={compact ? "line-clamp-2 text-body font-bold leading-body text-snow" : "line-clamp-2 text-body-lg font-bold leading-body-lg text-snow"}>{movie.name}</Title>
          <div className="mt-2 flex flex-wrap gap-1.5 text-caption font-semibold uppercase tracking-caption text-iron-veil">
            {movie.year && <span className="rounded-[4.5px] bg-snow/5 px-2 py-1">{movie.year}</span>}
            {movie.country && <span className="rounded-[4.5px] bg-snow/5 px-2 py-1">{movie.country}</span>}
          </div>
          {!compact && movie.category && <p className="mt-2 line-clamp-1 text-caption font-semibold uppercase tracking-caption text-iron-veil">{movie.category}</p>}
        </div>
      </article>
    </a>
  );
}
