"use client";

import { useState } from "react";
import { Play } from "lucide-react";

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
            src={poster}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-40 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-30"
            loading="eager"
            decoding="async"
          />
        </picture>
      ) : null}
      <div className="absolute inset-0 bg-[#000000] opacity-80 transition-opacity duration-300 group-hover:opacity-60" />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        <div className="flex h-12 w-20 items-center justify-center rounded-[8px] bg-[#3d6a99] text-[#ffffff] transition-transform duration-200 group-hover:scale-105">
          <Play className="h-6 w-6 fill-current" />
        </div>
        <div className="mt-6 flex flex-col items-center space-y-2">
          <span className="text-[24px] font-normal tracking-[0.083em] text-[#ffffff] uppercase">Bấm để xem phim</span>
          <p className="text-[14px] font-normal text-[#b8b6bb] max-w-[320px] mx-auto tracking-wide">
            Nguồn phát trình duyệt được tối ưu hóa cho Desktop và Android.
          </p>
        </div>
      </div>
    </div>
  );
}
