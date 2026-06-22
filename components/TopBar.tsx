"use client";

import { Clock3, Heart, Search, UserRound } from "lucide-react";
import { SearchSuggest } from "@/components/SearchSuggest";

export function TopBar({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={overlay ? "absolute inset-x-0 top-0 z-40 px-4 py-3" : "sticky top-0 z-40 bg-obsidian/90 px-4 py-4 backdrop-blur-md"}>
      <div className="flex items-center gap-2 sm:gap-3">
        {overlay ? (
          <a href="/" aria-label="Bluesia Cinema" className="mr-auto inline-flex items-center gap-2 text-snow drop-shadow-md">
            <img src="/icon.svg" alt="" className="h-7 w-7 rounded-md" />
            <span className="hidden text-xs font-black uppercase tracking-[0.16em] sm:inline">Bluesia</span>
          </a>
        ) : null}
        {overlay ? (
          <a href="/search" aria-label="Tìm kiếm" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-transparent text-ash-mist transition hover:bg-smoke hover:text-signal-blue">
            <Search className="h-5 w-5 text-snow drop-shadow-md" />
          </a>
        ) : (
          <div className="min-w-0 flex-1">
            <SearchSuggest />
          </div>
        )}
        <a href="/favorites" aria-label="Phim yêu thích" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-transparent text-ash-mist transition hover:bg-smoke hover:text-signal-blue">
          <Heart className="h-5 w-5" />
        </a>
        <a href="/history" aria-label="Lịch sử xem" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-transparent text-ash-mist transition hover:bg-smoke hover:text-signal-blue">
          <Clock3 className="h-5 w-5" />
        </a>
        <a href="/settings" aria-label="Cài đặt" className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-transparent text-ash-mist transition hover:bg-smoke hover:text-signal-blue">
          <UserRound className="h-5 w-5" />
        </a>
      </div>
    </header>
  );
}
