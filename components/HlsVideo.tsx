"use client";

import { useEffect, useRef, useState } from "react";

export function HlsVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hlsInstance: { destroy: () => void } | null = null;

    setError("");
    video.pause();
    video.removeAttribute("src");
    video.load();

    async function setup() {
      if (!video || disposed) return;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.load();
        return;
      }

      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;

        if (!Hls.isSupported()) {
          setError("Trinh duyet khong ho tro HLS.");
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 60,
          maxBufferLength: 45,
          maxMaxBufferLength: 90,
          maxBufferSize: 60 * 1024 * 1024,
        });

        hlsInstance = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!disposed) setError("Khong the tai trinh phat HLS.");
      }
    }

    void setup();

    return () => {
      disposed = true;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="h-full w-full bg-black"
        controls
        playsInline
        preload="metadata"
        poster={poster}
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-sm text-zinc-400">
          {error}
        </div>
      )}
    </div>
  );
}
