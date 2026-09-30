import type { ProviderReceipt } from "./contracts";

export function responseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function requiredProviderId(value: unknown, provider: string): string {
  const object = responseObject(value);
  const nestedData = responseObject(object.data);
  const nestedJson = responseObject(object.json);
  const nestedJsonData = responseObject(nestedJson.data);
  const candidate = object.id ?? object.publish_id ?? object.pin_id ?? object.post_id ?? object.name ?? nestedData.id ?? nestedData.name ?? nestedJsonData.id ?? nestedJsonData.name;
  if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${provider} response did not include a provider object id`);
  return candidate;
}

export function providerReceipt(provider: string, value: unknown, options: { url?: string; metadata?: Record<string, unknown> } = {}): ProviderReceipt {
  return { provider, externalId: requiredProviderId(value, provider), url: options.url, publishedAt: new Date().toISOString(), metadata: options.metadata };
}

export function assertSingleMedia(platform: string, mediaUrls: readonly string[]): string | undefined {
  if (mediaUrls.length > 1) throw new Error(`${platform} adapter currently supports one media asset per publish request`);
  return mediaUrls[0];
}

export function envUrl(name: string, fallback: string): string {
  return (process.env[name]?.trim() || fallback).replace(/\/$/, "");
}
