import { runtimeEnv } from "@/lib/runtime-env";

export type ImageVariant = "m" | "d";

export type SignedImagePair = {
  m: string;
  d: string;
};

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

  const cacheBase = env?.PUBLIC_IMAGE_CACHE_URL || (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.PUBLIC_IMAGE_CACHE_URL : process?.env?.PUBLIC_IMAGE_CACHE_URL);
  const secret = env?.IMAGE_CACHE_SIGNING_SECRET || (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.IMAGE_CACHE_SIGNING_SECRET : process?.env?.IMAGE_CACHE_SIGNING_SECRET);

  if (!cacheBase || !secret) {
    if (!secret && process?.env?.NODE_ENV !== "production") {
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
