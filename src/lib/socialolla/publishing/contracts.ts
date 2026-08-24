import { createHash } from "node:crypto";

export type PostVariant = {
  id: string;
  postId: string;
  platform: string;
  content: { text: string; mediaAssetIds: string[] };
};

export type ProviderReceipt = {
  provider: string;
  externalId: string;
  url?: string;
  publishedAt?: string;
  metadata?: Record<string, unknown>;
};

export function derivePublishIdempotencyKey(input: { workspaceId: string; postId: string; destinationId: string; variantId: string }): string {
  return `publish:${createHash("sha256").update([input.workspaceId, input.postId, input.destinationId, input.variantId].join("\n")).digest("hex")}`;
}

export function sanitizeProviderReceipt(receipt: ProviderReceipt): ProviderReceipt {
  if (!receipt.provider.trim() || !receipt.externalId.trim()) throw new Error("Provider receipt is incomplete");
  const raw = receipt.metadata ? JSON.parse(JSON.stringify(receipt.metadata)) as Record<string, unknown> : undefined;
  const metadata = raw ? Object.fromEntries(Object.entries(raw).filter(([key]) => !/(token|secret|password|authorization|api[_-]?key)/i.test(key)).slice(0, 50)) : undefined;
  return { provider: receipt.provider.slice(0, 80), externalId: receipt.externalId.slice(0, 200), url: receipt.url?.slice(0, 1000), publishedAt: receipt.publishedAt, metadata };
}
