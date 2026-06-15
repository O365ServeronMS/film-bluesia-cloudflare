import { runtimeEnv } from "@/lib/runtime-env";

export type ImageVariant = "m" | "d";

export type SignedImagePair = {
  m: string;
  d: string;
};

function envString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function sha256Hex(text: string) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, text: string) {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", keyMaterial, enc.encode(text));
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildCachedImageUrl(upstreamUrl: string | undefined, variant: ImageVariant): Promise<string> {
  if (!upstreamUrl) return "";

  try {
    const urlObj = new URL(upstreamUrl);
    if (!["http:", "https:"].includes(urlObj.protocol)) return upstreamUrl;
  } catch {
    return upstreamUrl;
  }

  const env = runtimeEnv() as Record<string, unknown> | undefined;
  const metaEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : undefined;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;

  const cacheBase =
    envString(env?.IMAGE_CACHE_BASE_URL) ||
    envString(env?.PUBLIC_IMAGE_CACHE_URL) ||
    envString(metaEnv?.IMAGE_CACHE_BASE_URL) ||
    envString(metaEnv?.PUBLIC_IMAGE_CACHE_URL) ||
    envString(processEnv?.IMAGE_CACHE_BASE_URL) ||
    envString(processEnv?.PUBLIC_IMAGE_CACHE_URL);
  const secret =
    envString(env?.IMAGE_CACHE_SIGNING_SECRET) ||
    envString(metaEnv?.IMAGE_CACHE_SIGNING_SECRET) ||
    envString(processEnv?.IMAGE_CACHE_SIGNING_SECRET);

  if (!cacheBase || !secret) {
    if (!secret && processEnv?.NODE_ENV !== "production") {
      console.warn("[image-cache] Missing IMAGE_CACHE_SIGNING_SECRET, falling back to upstream URL");
    }
    return upstreamUrl;
  }

  try {
    const normalizedUrl = upstreamUrl;
    const hash = await sha256Hex(normalizedUrl);
    const version = "v1";
    const payload = `${version}\n${variant}\n${hash}\n${normalizedUrl}`;
    const signatureHex = await hmacSha256Hex(secret, payload);

    return `${cacheBase.replace(/\/$/, "")}/i/${variant}/${hash}.webp?url=${encodeURIComponent(normalizedUrl)}&sig=${version}.${signatureHex}`;
  } catch (error) {
    console.error("[image-cache] Failed to sign image URL", error);
    return upstreamUrl;
  }
}

export async function buildCachedImagePair(upstreamUrl: string | undefined): Promise<SignedImagePair | undefined> {
  if (!upstreamUrl) return undefined;
  
  const [m, d] = await Promise.all([
    buildCachedImageUrl(upstreamUrl, "m"),
    buildCachedImageUrl(upstreamUrl, "d")
  ]);

  return { m, d };
}
