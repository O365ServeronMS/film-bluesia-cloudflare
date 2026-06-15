import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootUrl = pathToFileURL(`${process.cwd()}\\`).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(specifier.slice(2), rootUrl);
      if (!/\.[cm]?[jt]sx?$/.test(url.pathname) && existsSync(`${fileURLToPath(url)}.ts`)) {
        return nextResolve(`${url.href}.ts`, context);
      }
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  }
});
