"use client";

import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canPlayNativeHls, type PlaybackMode } from "@/lib/playback";

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
};

type HlsListener = (event: string, data: HlsErrorData) => void;

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
  off: (event: string, listener: (...args: never[]) => void) => void;
  on: (event: string, listener: (...args: never[]) => void) => void;
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

let hlsModulePromise: Promise<{ default: HlsConstructor }> | null = null;

function loadHlsModule() {
  if (!hlsModulePromise) {
    // Keep the light build outside the initial chunk and reuse one import per browser session.
    // @ts-expect-error hls.js does not publish declarations for the light-build subpath.
    hlsModulePromise = import("hls.js/dist/hls.light.js") as Promise<{ default: HlsConstructor }>;
  }
  return hlsModulePromise;
}

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
  };
}

function qualityLabel(level: HlsLevel, index: number) {
  if (level.height && Number.isFinite(level.height)) return `${level.height}p`;
  return level.name || `Mức ${index + 1}`;
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
    if (!existing || (level.bitrate || 0) > (levels[existing.levelIndex]?.bitrate || 0)) byHeight.set(height, option);
  });

  return [...options, ...byHeight.values()].sort((a, b) =>
    (levels[b.levelIndex]?.height || 0) - (levels[a.levelIndex]?.height || 0));
}

function srtToWebVtt(input: string) {
  const blocks = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split(/\n{2,}/);
  const cues = blocks.map((block) => {
    const lines = block.split("\n").filter(Boolean);
    if (/^\d+$/.test(lines[0] || "")) lines.shift();
    const timing = lines.shift();
    const match = timing?.match(/(.+?)\s+-->\s+(.+)/);
    if (!match) return "";
    return `${match[1].trim().replace(",", ".")} --> ${match[2].trim().replace(",", ".")}\n${lines.join("\n")}`;
  }).filter(Boolean);
  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

export function HlsVideo({
  mode,
  onPlaybackFailure,
  poster,
  src,
}: {
  mode: Extract<PlaybackMode, "native-hls" | "hls-js">;
  onPlaybackFailure?: () => void;
  poster?: string;
  src: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsRuntime | null>(null);
  const failureRef = useRef(onPlaybackFailure);
  const localSubtitleUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [localSubtitleUrl, setLocalSubtitleUrl] = useState("");
  failureRef.current = onPlaybackFailure;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hlsInstance: HlsRuntime | null = null;
    const cleanupListeners: Array<() => void> = [];

    setError("");
    setQualityOptions([]);
    setSelectedQuality("auto");
    hlsRef.current = null;
    video.pause();
    video.removeAttribute("src");
    video.load();

    const fail = (message: string) => {
      if (disposed) return;
      setError(message);
      failureRef.current?.();
    };

    async function setup() {
      if (!video || disposed) return;

      if (mode === "native-hls") {
        if (!canPlayNativeHls(video)) {
          fail("Trình duyệt không hỗ trợ HLS gốc.");
          return;
        }
        const onNativeError = () => fail("Không thể phát nguồn HLS gốc.");
        video.addEventListener("error", onNativeError, { once: true });
        cleanupListeners.push(() => video.removeEventListener("error", onNativeError));
        video.src = src;
        video.load();
        return;
      }

      try {
        const { default: Hls } = await loadHlsModule();
        if (disposed) return;
        if (!Hls.isSupported()) {
          fail("Trình duyệt không hỗ trợ HLS.");
          return;
        }

        const hls = new Hls(getHlsBufferConfig());
        const updateQualityOptions = () => setQualityOptions(buildQualityOptions(hls.levels || []));
        const onHlsError: HlsListener = (_event, data) => {
          if (!data.fatal || disposed) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          hls.destroy();
          hlsInstance = null;
          hlsRef.current = null;
          fail("Không thể phục hồi phiên phát HLS.");
        };

        hlsInstance = hls;
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, onHlsError as (...args: never[]) => void);
        hls.on(Hls.Events.MANIFEST_PARSED, updateQualityOptions as (...args: never[]) => void);
        if (Hls.Events.LEVELS_UPDATED) hls.on(Hls.Events.LEVELS_UPDATED, updateQualityOptions as (...args: never[]) => void);
        cleanupListeners.push(() => {
          hls.off(Hls.Events.ERROR, onHlsError as (...args: never[]) => void);
          hls.off(Hls.Events.MANIFEST_PARSED, updateQualityOptions as (...args: never[]) => void);
          if (Hls.Events.LEVELS_UPDATED) hls.off(Hls.Events.LEVELS_UPDATED, updateQualityOptions as (...args: never[]) => void);
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        fail("Không thể tải trình phát HLS.");
      }
    }

    void setup();
    return () => {
      disposed = true;
      cleanupListeners.forEach((cleanup) => cleanup());
      if (hlsInstance) {
        if (hlsRef.current === hlsInstance) hlsRef.current = null;
        hlsInstance.destroy();
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [mode, src]);

  useEffect(() => () => {
    if (localSubtitleUrlRef.current) URL.revokeObjectURL(localSubtitleUrlRef.current);
  }, []);

  function handleQualityChange(value: string) {
    setSelectedQuality(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value === "auto" ? -1 : Number(value);
  }

  async function handleSubtitleFile(file: File | undefined) {
    if (!file) return;
    const blob = file.name.toLowerCase().endsWith(".srt")
      ? new Blob([srtToWebVtt(await file.text())], { type: "text/vtt" })
      : file;
    const nextUrl = URL.createObjectURL(blob);
    if (localSubtitleUrlRef.current) URL.revokeObjectURL(localSubtitleUrlRef.current);
    localSubtitleUrlRef.current = nextUrl;
    setLocalSubtitleUrl(nextUrl);
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={videoRef} className="h-full w-full bg-black" controls playsInline preload="metadata" poster={poster}>
        {localSubtitleUrl ? <track key={localSubtitleUrl} kind="subtitles" src={localSubtitleUrl} srcLang="vi" label="Phụ đề" default /> : null}
      </video>
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-2 sm:right-3 sm:top-3">
        <select
          aria-label="Chọn chất lượng video"
          className="pointer-events-auto h-9 rounded-lg border border-white/15 bg-black/70 px-2 text-xs font-bold text-white outline-none backdrop-blur transition focus:border-signal-blue sm:h-10 sm:px-3"
          value={selectedQuality}
          onChange={(event) => handleQualityChange(event.target.value)}
        >
          <option value="auto">Tự động</option>
          {qualityOptions.map((option) => <option key={option.levelIndex} value={option.levelIndex}>{option.label}</option>)}
        </select>
        <button
          type="button"
          aria-label="Tải phụ đề từ thiết bị"
          title="Tải phụ đề từ thiết bị"
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg bg-[#facc15] text-black transition hover:bg-[#fde047] focus:outline-none focus:ring-2 focus:ring-[#facc15]/70 sm:h-10 sm:w-10"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
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
      {error ? <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-sm text-zinc-400">{error}</div> : null}
    </div>
  );
}
