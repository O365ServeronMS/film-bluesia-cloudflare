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
    <button
      type="button"
      aria-label={`Phát ${title}`}
      onClick={() => setIsPlaying(true)}
      className="group relative block h-full w-full cursor-pointer overflow-hidden bg-obsidian text-left transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-glacier-beam"
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40 transition duration-700 ease-out group-hover:scale-105 group-hover:opacity-30"
          loading="eager"
          decoding="async"
        />
      ) : null}
      <span className="absolute inset-0 bg-obsidian/80 transition-colors duration-300 group-hover:bg-obsidian/65" />
      <span className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-signal-blue text-snow transition-transform duration-200 group-hover:scale-105 sm:h-20 sm:w-20">
          <Play className="ml-1 h-8 w-8 fill-current sm:h-10 sm:w-10" aria-hidden="true" />
        </span>
        <span className="mt-6 flex flex-col items-center gap-2">
          <span className="text-heading-sm font-semibold leading-heading-sm text-snow">Bấm Play để bắt đầu</span>
          <span className="mx-auto max-w-[320px] text-center text-body font-normal leading-body text-ash-mist">Video chỉ được tải sau thao tác này.</span>
        </span>
      </span>
    </button>
  );
}
