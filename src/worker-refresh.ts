import { refreshLatestOphimMovies } from "@/lib/ophim";
import { setCacheBypassRefresh, setRuntimeEnv } from "@/lib/runtime-env";
import { generateSnapshots } from "@/lib/snapshot";

type WorkerEnv = {
  OPHIM_REFRESH_MAX_MOVIES?: string;
  OPHIM_REFRESH_DELAY_MS?: string;
  [key: string]: unknown;
};

type ScheduledController = {
  cron?: string;
  scheduledTime?: number;
};

function numericEnv(env: WorkerEnv, key: "OPHIM_REFRESH_MAX_MOVIES" | "OPHIM_REFRESH_DELAY_MS") {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export default {
  async scheduled(controller: ScheduledController, env: WorkerEnv) {
    setRuntimeEnv(env);
    setCacheBypassRefresh(false);
    const startedAt = Date.now();
    console.log("[cache] OPHIM_REFRESH_START", {
      cron: controller.cron,
      scheduledTime: controller.scheduledTime ? new Date(controller.scheduledTime).toISOString() : undefined
    });

    try {
      const result = await refreshLatestOphimMovies({
        maxMovies: numericEnv(env, "OPHIM_REFRESH_MAX_MOVIES"),
        delayMs: numericEnv(env, "OPHIM_REFRESH_DELAY_MS")
      });
      
      const snapshotResult = await generateSnapshots();

      console.log("[cache] OPHIM_REFRESH_SUCCESS", {
        ...result,
        snapshotSuccess: snapshotResult?.success,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      console.error("[cache] OPHIM_REFRESH_FAIL", {
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt
      });
      throw error;
    } finally {
      setCacheBypassRefresh(false);
    }
  }
};
