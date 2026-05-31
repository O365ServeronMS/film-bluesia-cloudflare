type RuntimeEnv = Record<string, unknown> | undefined;

let currentEnv: RuntimeEnv;
let currentCacheBypassRefresh = false;

export function setRuntimeEnv(env: RuntimeEnv) {
  currentEnv = env;
}

export function runtimeEnv<T extends RuntimeEnv = RuntimeEnv>() {
  return currentEnv as T;
}

export function setCacheBypassRefresh(value: boolean) {
  currentCacheBypassRefresh = value;
}

export function cacheBypassRefresh() {
  return currentCacheBypassRefresh;
}
