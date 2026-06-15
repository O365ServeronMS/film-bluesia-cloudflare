import { Heart, Star } from "lucide-react";
import type { MovieCard as MovieCardType } from "@/lib/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { getDisplayRatings, proxiedImage, proxiedImageCandidateSrcSet } from "@/lib/utils";

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
  if (movie.thumbSigned?.m && movie.thumbSigned.m !== movie.posterSigned?.m) {
    fallbackImage = movie.thumbSigned.m;
  } else if (fallbackUrl && fallbackUrl !== posterUrl) {
    fallbackImage = proxiedImage(fallbackUrl, "mobile");
  }

  let imageSrc = LOCAL_IMAGE_PLACEHOLDER;
  let imageSrcSet: string | undefined = undefined;

  if (movie.posterSigned?.m && movie.posterSigned?.d) {
    imageSrc = movie.posterSigned.m;
    imageSrcSet = `${movie.posterSigned.m} 360w, ${movie.posterSigned.d} 560w`;
  } else if (posterUrl) {
    imageSrc = proxiedImage(posterUrl, "mobile");
    imageSrcSet = proxiedImageCandidateSrcSet(posterUrl, [
      { profile: "mobile", width: 360 },
      { profile: "desktop", width: 560 }
    ]);
  }
  const imageClassName = "h-full w-full object-cover transition duration-500 group-hover:scale-105";
  const Title = headingLevel === 2 ? "h2" : "h3";
  const displayRatings = getDisplayRatings(movie);

  const detailHref = hrefWithReturnTo(`/movie/${movie.slug}`, returnTo, navSourceKey);

  return (
    <a href={detailHref} className="group block min-w-0">
      <article className="overflow-hidden rounded-2xl bg-card shadow-xl shadow-black/20 ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:ring-gold/50">
        <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
          <img
            src={imageSrc}
            srcSet={imageSrcSet}
            sizes="(min-width: 640px) 180px, 31vw"
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
            {displayRatings.length ? (
              <div className="flex flex-col items-start gap-1">
                {displayRatings.map((rating) => (
                  <span key={rating.label} className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-gold backdrop-blur">
                    <Star className="h-3 w-3 fill-gold" /> {rating.text}
                  </span>
                ))}
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur">
              <Heart className="h-4 w-4" />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-12">
            <span className="rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">{movie.episodeCurrent || "Full"}</span>
            {movie.quality && <span className="rounded-md bg-gold px-2 py-1 text-[10px] font-black text-black">{movie.quality}</span>}
          </div>
        </div>
        <div className="p-3">
          <Title className={compact ? "line-clamp-2 text-sm font-bold leading-snug" : "line-clamp-2 text-[15px] font-bold leading-snug"}>{movie.name}</Title>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-zinc-400">
            {movie.year && <span className="rounded-md bg-white/5 px-2 py-1">{movie.year}</span>}
            {movie.country && <span className="rounded-md bg-white/5 px-2 py-1">{movie.country}</span>}
          </div>
          {!compact && movie.category && <p className="mt-2 line-clamp-1 text-xs text-zinc-400">{movie.category}</p>}
        </div>
      </article>
    </a>
  );
}
