import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function stripHtml(value?: string) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function ratingLabel(movie: { tmdb?: { vote_average?: number }; imdb?: { rating?: number } }) {
  const imdb = Number(movie.imdb?.rating || 0);
  const tmdb = Number(movie.tmdb?.vote_average || 0);
  if (imdb > 0) return `IMDB ${imdb.toFixed(1).replace(".0", "")}`;
  if (tmdb > 0) return `TMDB ${tmdb.toFixed(1).replace(".0", "")}`;
  return "TMDB";
}

export function normalizeEpisodeName(value?: string, index = 0) {
  const clean = (value || "").trim();
  if (!clean) return `Tập ${index + 1}`;
  return clean.toLowerCase().startsWith("tập") ? clean : `Tập ${clean}`;
}

export function proxiedImage(src?: string, width?: number, quality?: number) {
  if (!src) return "";
  if (src.startsWith("/api/image")) return src;
  if (src.startsWith("/")) return src;
  const params = new URLSearchParams({ url: src });
  if (width) params.set("w", String(width));
  if (quality) params.set("q", String(quality));
  return `/api/image?${params.toString()}`;
}

export function proxiedImageSrcSet(src: string | undefined, widths: number[], quality?: number) {
  if (!src || src.startsWith("/") || src.startsWith("/api/image")) return undefined;
  return widths.map((width) => `${proxiedImage(src, width, quality)} ${width}w`).join(", ");
}

export function proxiedImageCandidateSrcSet(src: string | undefined, candidates: { width: number; quality?: number }[]) {
  if (!src || src.startsWith("/") || src.startsWith("/api/image")) return undefined;
  return candidates.map(({ width, quality }) => `${proxiedImage(src, width, quality)} ${width}w`).join(", ");
}
