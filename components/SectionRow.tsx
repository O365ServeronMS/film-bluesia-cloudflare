import { ChevronRight } from "lucide-react";
import type { MovieCard as MovieCardType } from "@/lib/types";
import { MovieCard } from "@/components/MovieCard";

export function SectionRow({
  title,
  href,
  items,
  returnTo = "",
  spotlight = false,
  itemLimit = 8
}: {
  title: string;
  href: string;
  items: MovieCardType[];
  returnTo?: string;
  spotlight?: boolean;
  itemLimit?: number;
}) {
  if (!items.length) return null;
  return (
    <section className={spotlight ? "relative z-20 -mt-8 px-4" : "mt-8 px-4"}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading-sm font-bold leading-heading-sm tracking-tight text-snow">{title}</h2>
        <a href={href} className="inline-flex items-center gap-1 text-body font-medium text-ash-mist transition-colors hover:text-signal-blue">
          Xem tất cả <ChevronRight className="h-4 w-4" />
        </a>
      </div>
      <div className={spotlight ? "no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2" : "grid grid-cols-3 gap-3 sm:grid-cols-4"}>
        {items.slice(0, itemLimit).map((movie, index) =>
          spotlight ? (
            <div key={movie.slug} className="w-[132px] shrink-0 snap-start sm:w-[150px]">
              <MovieCard movie={movie} compact returnTo={returnTo} />
            </div>
          ) : index >= 6 ? (
            <div key={movie.slug} className="hidden sm:block">
              <MovieCard movie={movie} compact returnTo={returnTo} />
            </div>
          ) : (
            <MovieCard key={movie.slug} movie={movie} compact returnTo={returnTo} />
          )
        )}
      </div>
    </section>
  );
}
