"use client";



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

export function HlsVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsRuntime | null>(null);
  const [error, setError] = useState("");
  const [isNativeHls, setIsNativeHls] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hlsInstance: HlsRuntime | null = null;
    let detachHlsErrorListener: (() => void) | null = null;

    setError("");
    setIsNativeHls(false);
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
        setIsNativeHls(true);
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
      </video>
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-sm text-zinc-400">
          {error}
        </div>
      )}
    </div>
  );
}
