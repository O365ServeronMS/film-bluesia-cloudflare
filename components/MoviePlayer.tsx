"use client";

import { Play, X } from "lucide-react";
import { useRef, useState } from "react";
import type { MovieCard } from "@/lib/types";
import { HlsVideo } from "@/components/HlsVideo";
import { IframePlayerFacade } from "@/components/IframePlayerFacade";
import { WatchRecorder } from "@/components/WatchRecorder";

type MoviePlayerProps = {
  embedSrc?: string;
  episodeLabel: string;
  hlsSrc?: string;
  initialOpen?: boolean;
  movie: MovieCard;
  poster?: string;
  title: string;
  useEmbedPlayer: boolean;
};

export function MoviePlayer({
  embedSrc,
  episodeLabel,
  hlsSrc,
  initialOpen = false,
  movie,
  poster,
  title,
  useEmbedPlayer,
}: MoviePlayerProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const playerRef = useRef<HTMLDivElement | null>(null);

  function openPlayer() {
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        aria-controls="movie-player"
        aria-expanded={isOpen}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-signal-blue px-6 py-3 text-[14px] font-bold uppercase tracking-[0.083em] text-snow transition-colors hover:bg-signal-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glacier-beam"
        onClick={openPlayer}
      >
        <Play className="h-5 w-5 fill-current" aria-hidden="true" />
        {isOpen ? "Player đã sẵn sàng" : "Xem phim"}
      </button>

      {isOpen ? (
        <div ref={playerRef} id="movie-player" className="scroll-mt-4 overflow-hidden rounded-lg border border-white/10 bg-obsidian">
          <WatchRecorder movie={movie} />
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-smoke px-4 py-3">
            <div className="min-w-0">
              <p className="text-caption font-semibold uppercase tracking-caption text-glacier-beam">Đang chọn</p>
              <p className="truncate text-body font-bold text-snow">{episodeLabel}</p>
            </div>
            <button
              type="button"
              aria-label="Đóng player"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 text-snow transition-colors hover:border-white/40 hover:bg-white/5"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="aspect-video w-full bg-black">
            {useEmbedPlayer && embedSrc ? (
              <IframePlayerFacade src={embedSrc} poster={poster} title={title} />
            ) : hlsSrc ? (
              <HlsVideo src={hlsSrc} poster={poster} />
            ) : embedSrc ? (
              <IframePlayerFacade src={embedSrc} poster={poster} title={title} />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-body text-ash-mist">Không có link xem cho tập này.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
