"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { proxiedImage } from "@/lib/utils";

type IframePlayerFacadeProps = {
  src: string;
  poster?: string;
  title: string;
};

export function IframePlayerFacade({ src, poster, title }: IframePlayerFacadeProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  if (isPlaying) {
    return (
      <iframe
        src={src}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        referrerPolicy="origin"
        allowFullScreen
        className="h-full w-full border-0 bg-black"
      />
    );
  }

  return (
    <div
      onClick={() => setIsPlaying(true)}
      className="group relative h-full w-full cursor-pointer overflow-hidden bg-zinc-950 transition duration-300"
    >
      {poster ? (
        <picture>
          <img
            src={proxiedImage(poster, "backdrop-desktop")}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-40 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-30"
            loading="eager"
            decoding="async"
          />
        </picture>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/90 text-black shadow-glow transition duration-300 group-hover:scale-110 group-hover:bg-gold">
          <Play className="h-6 w-6 fill-black ml-1 transition-transform group-hover:translate-x-0.5" />
        </div>
        <div className="space-y-1">
          <span className="text-sm font-black text-white drop-shadow">Bấm để tải và xem phim</span>
          <p className="text-xs text-zinc-400 max-w-[280px] mx-auto drop-shadow-sm">
            Nguồn phát video nhúng sẽ được nạp sau khi nhấp chuột.
          </p>
        </div>
      </div>
    </div>
  );
}
