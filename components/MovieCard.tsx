import { Heart, Star } from "lucide-react";
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
  const posterUrl = validHttpImage(movie.poster) || validHttpImage(movie.thumb);
  const fallbackUrl = validHttpImage(movie.thumb) || validHttpImage(movie.poster);
  
  let fallbackImage = "";
  if (movie.thumbSigned?.d && movie.thumbSigned.d !== movie.posterSigned?.d) {
    fallbackImage = movie.thumbSigned.d;
  } else if (fallbackUrl && fallbackUrl !== posterUrl) {
    fallbackImage = fallbackUrl;
  }

  let imageSrc = LOCAL_IMAGE_PLACEHOLDER;
  let imageSrcSet: string | undefined = undefined;

  if (movie.posterSigned?.m && movie.posterSigned?.d) {
    imageSrc = movie.posterSigned.d;
    imageSrcSet = `${movie.posterSigned.m} 480w, ${movie.posterSigned.d} 960w`;
  } else if (posterUrl) {
    imageSrc = posterUrl;
  }
  const imageClassName = "h-full w-full object-cover transition duration-500 group-hover:scale-105";
  const Title = headingLevel === 2 ? "h2" : "h3";
  const displayRating = getDisplayRating(movie);

  const detailHref = hrefWithReturnTo(`/movie/${movie.slug}`, returnTo, navSourceKey);

  return (
    <a href={detailHref} className="group block min-w-0">
      <article className="overflow-hidden rounded-lg bg-smoke transition duration-300">
        <div className="relative aspect-[2/3] overflow-hidden bg-obsidian">
          <img
            src={imageSrc}
            srcSet={imageSrcSet}
            sizes="(max-width: 767px) 480px, 960px"
            alt={movie.name}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            data-movie-poster
            data-fallback-src={fallbackImage || undefined}
            data-original-src={posterUrl || undefined}
            data-placeholder-src={LOCAL_IMAGE_PLACEHOLDER}
            className={imageClassName}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            {displayRating ? (
              <div className="flex flex-col items-start gap-1">
                <span className="inline-flex items-center gap-1 rounded-[4.5px] bg-obsidian/70 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.083em] text-snow">
                  <Star className="h-3 w-3 fill-current text-snow" /> {displayRating.text}
                </span>
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="grid h-8 w-8 place-items-center rounded-full bg-obsidian/80 text-snow">
              <Heart className="h-4 w-4" />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-obsidian/90 via-obsidian/50 to-transparent p-2 pt-12">
            <span className="rounded-[4.5px] bg-obsidian/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.083em] text-snow">{movie.episodeCurrent || "Full"}</span>
            {movie.quality && <span className="rounded-[4.5px] bg-snow/20 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.083em] text-snow">{movie.quality}</span>}
          </div>
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
