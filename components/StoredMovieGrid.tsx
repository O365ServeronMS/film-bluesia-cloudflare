"use client";

import { useLocalMovies, EmptyState } from "@/components/LocalMovieActions";
import { MovieCard } from "@/components/MovieCard";

export function StoredMovieGrid({ type }: { type: "favorites" | "history" }) {
  const { items } = useLocalMovies(type);

  if (!items.length) {
    return <EmptyState title={type === "favorites" ? "Chưa có phim yêu thích" : "Chưa có lịch sử xem"} description="Dữ liệu này được lưu cục bộ trong trình duyệt của bạn, không gửi lên máy chủ." />;
  }

  return (
    <div className="grid grid-cols-3 gap-3 px-4 pt-4 sm:grid-cols-4">
      {items.map((movie) => <MovieCard key={movie.slug} movie={movie} compact />)}
    </div>
  );
}
