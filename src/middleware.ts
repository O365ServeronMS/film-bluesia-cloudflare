import { defineMiddleware } from "astro:middleware";
import { setRuntimeEnv } from "@/lib/runtime-env";

export const onRequest = defineMiddleware((context, next) => {
  setRuntimeEnv(context.locals.runtime?.env);
  return next();
});
