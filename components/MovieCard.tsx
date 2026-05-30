import { Heart, Star } from "lucide-react";
import { LazyImage } from "@/components/LazyImage";
import type { MovieCard as MovieCardType } from "@/lib/types";
import { proxiedImage, proxiedImageCandidateSrcSet, ratingLabel } from "@/lib/utils";

export function MovieCard({
  movie,
  compact = false,
  headingLevel = 3,
  deferImage = false,
  priority = false
}: {
  movie: MovieCardType;
  compact?: boolean;
  headingLevel?: 2 | 3;
  deferImage?: boolean;
  priority?: boolean;
}) {
  const image = movie.poster || movie.thumb;
  const imageSrc = image ? proxiedImage(image, 360, 60) : "";
  const mobileImageSrcSet = image ? proxiedImageCandidateSrcSet(image, [
    { width: 360, quality: 60 }
  ]) : "";
  const desktopImageSrcSet = image ? proxiedImageCandidateSrcSet(image, [
    { width: 720, quality: 70 }
  ]) : "";
  const mobileImageSizes = "31vw";
  const desktopImageSizes = "720px";
  const imageClassName = "h-full w-full object-cover transition duration-500 group-hover:scale-105";
  const Title = headingLevel === 2 ? "h2" : "h3";

  return (
    <a href={`/movie/${movie.slug}`} className="group block min-w-0">
      <article className="overflow-hidden rounded-2xl bg-card shadow-xl shadow-black/20 ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:ring-gold/50">
        <div className="relative aspect-[2/3] overflow-hidden bg-zinc-900">
          {image ? (
            deferImage && !priority ? (
              <LazyImage
                src={imageSrc}
                srcSet={mobileImageSrcSet}
                desktopSrcSet={desktopImageSrcSet}
                sizes={mobileImageSizes}
                desktopSizes={desktopImageSizes}
                alt={movie.name}
                className={imageClassName}
              />
            ) : (
              <picture>
                <source media="(min-width: 640px)" srcSet={desktopImageSrcSet} sizes={desktopImageSizes} />
                <img
                  src={imageSrc}
                  srcSet={mobileImageSrcSet}
                  sizes={mobileImageSizes}
                  alt={movie.name}
                  loading={priority ? "eager" : "lazy"}
                  fetchPriority={priority ? "high" : "auto"}
                  decoding="async"
                  className={imageClassName}
                />
              </picture>
            )
          ) : (
            <div className="grid h-full place-items-center px-4 text-center text-sm text-zinc-500">Không có ảnh</div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-gold backdrop-blur">
              <Star className="h-3 w-3 fill-gold" /> {ratingLabel(movie)}
            </span>
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
