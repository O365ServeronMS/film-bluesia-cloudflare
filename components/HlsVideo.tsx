"use client";

import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
};

type HlsListener = (event: string, data: any) => void;

type HlsLevel = {
  bitrate?: number;
  height?: number;
  name?: string;
};

type HlsRuntime = {
  attachMedia: (media: HTMLMediaElement) => void;
  currentLevel: number;
  destroy: () => void;
  levels: HlsLevel[];
  loadSource: (source: string) => void;
  off: (event: string, listener: HlsListener) => void;
  on: (event: string, listener: HlsListener) => void;
  recoverMediaError: () => void;
  startLoad: () => void;
};

type HlsConstructor = {
  new (config: Record<string, unknown>): HlsRuntime;
  ErrorTypes: {
    MEDIA_ERROR: string;
    NETWORK_ERROR: string;
  };
  Events: {
    ERROR: string;
    LEVELS_UPDATED?: string;
    MANIFEST_PARSED: string;
  };
  isSupported: () => boolean;
};

type QualityOption = {
  label: string;
  levelIndex: number;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

const DEFAULT_HLS_BUFFER_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  backBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000,
  manifestLoadingMaxRetry: 3,
  manifestLoadingRetryDelay: 1000,
  fragLoadingMaxRetry: 4,
  fragLoadingRetryDelay: 1000,
};

function hasGoodNetworkForAggressiveBuffering() {
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection || connection.saveData) return false;

  const effectiveType = connection.effectiveType?.toLowerCase();
  return effectiveType !== "slow-2g" && effectiveType !== "2g";
}

function getHlsBufferConfig() {
  if (!hasGoodNetworkForAggressiveBuffering()) return DEFAULT_HLS_BUFFER_CONFIG;

  return {
    ...DEFAULT_HLS_BUFFER_CONFIG,
    maxBufferLength: 180,
    maxMaxBufferLength: 300,
    maxBufferSize: 120 * 1000 * 1000,
    backBufferLength: 60,
  };
}

function canUseNativeHls(video: HTMLVideoElement) {
  return Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
}

function qualityLabel(level: HlsLevel, index: number) {
  if (level.height && Number.isFinite(level.height)) return `${level.height}p`;
  if (level.name) return level.name;
  return `Mức ${index + 1}`;
}

function buildQualityOptions(levels: HlsLevel[]) {
  const byHeight = new Map<number, QualityOption>();
  const options: QualityOption[] = [];

  levels.forEach((level, index) => {
    const height = level.height && Number.isFinite(level.height) ? level.height : 0;
    const option = { label: qualityLabel(level, index), levelIndex: index };

    if (!height) {
      options.push(option);
      return;
    }

    const existing = byHeight.get(height);
    if (!existing || (level.bitrate || 0) > (levels[existing.levelIndex]?.bitrate || 0)) {
      byHeight.set(height, option);
    }
  });

  return [...options, ...Array.from(byHeight.values())].sort((a, b) => {
    const left = levels[a.levelIndex]?.height || 0;
    const right = levels[b.levelIndex]?.height || 0;
    return right - left;
  });
}

function srtTimestampToVtt(timestamp: string) {
  return timestamp.trim().replace(",", ".");
}

function srtToWebVtt(input: string) {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  const cues = blocks
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (/^\d+$/.test(lines[0] || "")) lines.shift();

      const timing = lines.shift();
      if (!timing) return "";

      const match = timing.match(/(.+?)\s+-->\s+(.+)/);
      if (!match) return "";

      return `${srtTimestampToVtt(match[1])} --> ${srtTimestampToVtt(match[2])}\n${lines.join("\n")}`;
    })
    .filter(Boolean);

  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

export function HlsVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsRuntime | null>(null);
  const localSubtitleUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [localSubtitleUrl, setLocalSubtitleUrl] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hlsInstance: HlsRuntime | null = null;
    let detachHlsErrorListener: (() => void) | null = null;
    let detachHlsLevelListener: (() => void) | null = null;

    setError("");
    setQualityOptions([]);
    setSelectedQuality("auto");
    hlsRef.current = null;
    video.pause();
    video.removeAttribute("src");
    video.load();

    async function setup() {
      if (!video || disposed) return;

      const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const fallbackToNativeHls = () => {
        if (!video || disposed || !canUseNativeHls(video)) return false;

        setError("");
        video.src = src;
        video.load();
        return true;
      };

      if (isIos) {
        if (!fallbackToNativeHls()) {
          setError("Trình duyệt không hỗ trợ HLS.");
        }
        return;
      }

      try {
        const { default: Hls } = (await import("hls.js/dist/hls.light.js")) as { default: HlsConstructor };
        if (disposed) return;

        if (!Hls.isSupported()) {
          if (!fallbackToNativeHls()) {
            setError("Trinh duyet khong ho tro HLS.");
          }
          return;
        }

        const hls = new Hls(getHlsBufferConfig());
        const updateQualityOptions = () => {
          setQualityOptions(buildQualityOptions(hls.levels || []));
        };

        const onHlsError: HlsListener = (_event: string, data: HlsErrorData) => {
          if (!data.fatal || disposed) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }

          if (detachHlsErrorListener) {
            detachHlsErrorListener();
            detachHlsErrorListener = null;
          }
          hls.destroy();
          hlsInstance = null;
          hlsRef.current = null;

          if (!fallbackToNativeHls()) {
            setError("Khong the phuc hoi phien phat HLS.");
          }
        };

        hlsInstance = hls;
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, onHlsError);
        detachHlsErrorListener = () => hls.off(Hls.Events.ERROR, onHlsError);
        hls.on(Hls.Events.MANIFEST_PARSED, updateQualityOptions);
        if (Hls.Events.LEVELS_UPDATED) hls.on(Hls.Events.LEVELS_UPDATED, updateQualityOptions);
        detachHlsLevelListener = () => {
          hls.off(Hls.Events.MANIFEST_PARSED, updateQualityOptions);
          if (Hls.Events.LEVELS_UPDATED) hls.off(Hls.Events.LEVELS_UPDATED, updateQualityOptions);
        };
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!disposed && !fallbackToNativeHls()) {
          setError("Khong the tai trinh phat HLS.");
        }
      }
    }

    void setup();

    return () => {
      disposed = true;
      if (detachHlsErrorListener) {
        detachHlsErrorListener();
        detachHlsErrorListener = null;
      }
      if (detachHlsLevelListener) {
        detachHlsLevelListener();
        detachHlsLevelListener = null;
      }
      if (hlsInstance) {
        if (hlsRef.current === hlsInstance) hlsRef.current = null;
        hlsInstance.destroy();
        hlsInstance = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  useEffect(() => {
    return () => {
      if (localSubtitleUrlRef.current) {
        URL.revokeObjectURL(localSubtitleUrlRef.current);
        localSubtitleUrlRef.current = null;
      }
    };
  }, []);

  function handleQualityChange(value: string) {
    setSelectedQuality(value);
    if (!hlsRef.current) return;

    hlsRef.current.currentLevel = value === "auto" ? -1 : Number(value);
  }

  async function handleSubtitleFile(file: File | undefined) {
    if (!file) return;

    const name = file.name.toLowerCase();
    let subtitleBlob: Blob;

    if (name.endsWith(".srt")) {
      subtitleBlob = new Blob([srtToWebVtt(await file.text())], { type: "text/vtt" });
    } else {
      subtitleBlob = file;
    }

    const nextUrl = URL.createObjectURL(subtitleBlob);
    if (localSubtitleUrlRef.current) URL.revokeObjectURL(localSubtitleUrlRef.current);
    localSubtitleUrlRef.current = nextUrl;
    setLocalSubtitleUrl(nextUrl);
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="h-full w-full bg-black"
        controls
        playsInline
        preload="metadata"
        poster={poster}
      >
        {localSubtitleUrl && <track key={localSubtitleUrl} kind="subtitles" src={localSubtitleUrl} srcLang="vi" label="Phụ đề" default />}
      </video>
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-4">
        <div className="pointer-events-auto relative">
          <select
            aria-label="Chọn chất lượng video"
            className="appearance-none h-[40px] rounded-[8px] border border-[#89868e] bg-[#050409] px-4 pr-10 text-[14px] font-semibold text-[#ffffff] transition-colors hover:bg-[#000000] hover:border-[#ffffff] focus:border-[#3d6a99] outline-none cursor-pointer"
            value={selectedQuality}
            onChange={(event) => handleQualityChange(event.target.value)}
          >
            <option value="auto">Tự động</option>
            {qualityOptions.map((option) => (
              <option key={option.levelIndex} value={String(option.levelIndex)} className="bg-[#050409] text-[#ffffff]">
                {option.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#ffffff]">
            <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
          </div>
        </div>
        <button
          type="button"
          aria-label="Tải phụ đề từ thiết bị"
          title="Tải phụ đề từ thiết bị"
          className="pointer-events-auto flex items-center justify-center h-[40px] w-[40px] rounded-[8px] bg-[#3d6a99] text-[#ffffff] transition-colors hover:bg-[#2b4d70] focus:outline-none"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" strokeWidth={2} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".vtt,.srt,text/vtt,application/x-subrip"
          onChange={(event) => {
            void handleSubtitleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-sm text-zinc-400">
          {error}
        </div>
      )}
    </div>
  );
}
