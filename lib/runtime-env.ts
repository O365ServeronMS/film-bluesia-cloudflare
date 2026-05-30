type RuntimeEnv = Record<string, unknown> | undefined;

let currentEnv: RuntimeEnv;

export function setRuntimeEnv(env: RuntimeEnv) {
  currentEnv = env;
}

export function runtimeEnv<T extends RuntimeEnv = RuntimeEnv>() {
  return currentEnv as T;
}
