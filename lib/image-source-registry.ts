import { runtimeEnv } from "@/lib/runtime-env";

const DEFAULT_ALLOWED_HOSTS = [
  "img.ophim.live",
  "img.ophim.cc",
  "img.ophim1.com"
];

const DEFAULT_ALLOWED_SUFFIXES = [
  ".ophim.live",
  ".ophim.cc",
  ".ophim1.com"
];

export type ImageSourceRegistry = {
  allowedHosts: Set<string>;
  allowedSuffixes: string[];
};

export type ImageHostValidationResult =
  | { ok: true; url: URL; host: string }
  | { ok: false; host: string; error: string; reason: string };

function envValue(key: "IMAGE_ALLOWED_HOSTS" | "IMAGE_ALLOWED_HOST_SUFFIXES") {
  const env = runtimeEnv<Record<string, unknown>>() || {};
  return String(env[key] || process.env[key] || "");
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeSuffix(value: string) {
  const suffix = normalizeHost(value);
  return suffix ? (suffix.startsWith(".") ? suffix : `.${suffix}`) : "";
}

function isIpAddress(host: string) {
  const clean = host.replace(/^\[/, "").replace(/\]$/, "");
  if (clean.includes(":")) return true;
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(clean);
}

function isLocalOrPrivateHost(host: string) {
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (!host.includes(".")) return true;
  return isIpAddress(host);
}

export function imageSourceRegistry(): ImageSourceRegistry {
  const allowedHosts = new Set([
    ...DEFAULT_ALLOWED_HOSTS,
    ...parseList(envValue("IMAGE_ALLOWED_HOSTS"))
  ].map(normalizeHost).filter(Boolean));

  const allowedSuffixes = Array.from(new Set([
    ...DEFAULT_ALLOWED_SUFFIXES,
    ...parseList(envValue("IMAGE_ALLOWED_HOST_SUFFIXES")).map(normalizeSuffix)
  ].filter(Boolean)));

  return { allowedHosts, allowedSuffixes };
}

export function validateImageSourceUrl(value: string, registry = imageSourceRegistry()): ImageHostValidationResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      ok: false,
      host: "",
      error: "IMAGE_URL_INVALID",
      reason: "Image URL must be an absolute http or https URL"
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      host: normalizeHost(url.hostname),
      error: "IMAGE_URL_INVALID",
      reason: "Image URL must use http or https"
    };
  }

  url.hostname = normalizeHost(url.hostname);
  const host = url.hostname;

  if (isLocalOrPrivateHost(host)) {
    return {
      ok: false,
      host,
      error: "IMAGE_HOST_NOT_ALLOWED",
      reason: "IP addresses, localhost, and private network hosts are not allowed"
    };
  }

  if (registry.allowedHosts.has(host)) {
    return { ok: true, url, host };
  }

  if (registry.allowedSuffixes.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)) {
    return { ok: true, url, host };
  }

  return {
    ok: false,
    host,
    error: "IMAGE_HOST_NOT_ALLOWED",
    reason: "Host is not in IMAGE_ALLOWED_HOSTS or IMAGE_ALLOWED_HOST_SUFFIXES"
  };
}

export function imageHostErrorBody(result: Extract<ImageHostValidationResult, { ok: false }>, profile: string, sourceUrl: string) {
  return {
    error: result.error,
    host: result.host,
    profile,
    reason: result.reason,
    sourceOrigin: sourceUrl
  };
}

export function allowedImageHostsForDiagnostics(registry = imageSourceRegistry()) {
  return {
    allowedHosts: Array.from(registry.allowedHosts).sort(),
    allowedSuffixes: [...registry.allowedSuffixes].sort()
  };
}
