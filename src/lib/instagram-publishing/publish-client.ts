import { z } from "zod";

const idSchema = z.object({ id: z.string().min(1) });

export type InstagramPublishClientConfig = Readonly<{ graphVersion: string; userId: string; accessToken: string }>;

export class InstagramPublishError extends Error {
  constructor(message: string, public readonly retryable = false, public readonly reconciliationRequired = false) {
    super(message);
    this.name = "InstagramPublishError";
  }
}

function assertControlledMediaUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new InstagramPublishError("Instagram media must use a controlled HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new InstagramPublishError("Instagram media must use a controlled HTTPS URL.");
  const configuredBase = process.env.APP_URL ?? process.env.APP_BASE_URL;
  if (!configuredBase) throw new InstagramPublishError("Instagram media URL base is not configured.");
  let expected: URL;
  try { expected = new URL(configuredBase); } catch { throw new InstagramPublishError("Instagram media URL base is invalid."); }
  if (expected.protocol !== "https:" || url.origin !== expected.origin || !url.pathname.startsWith("/api/media/")) throw new InstagramPublishError("Instagram media host is not an approved application media endpoint.");
  return url.toString();
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    throw new InstagramPublishError("Instagram rejected the publishing request.", retryable, response.status >= 500);
  }
  if (!body || typeof body !== "object") throw new InstagramPublishError("Instagram returned an invalid publishing response.", false, true);
  return body as Record<string, unknown>;
}

function endpoint(config: InstagramPublishClientConfig, path: string): string {
  return `https://graph.instagram.com/${config.graphVersion}/${config.userId}/${path}`;
}

async function publishRequest(input: InstagramPublishClientConfig, path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(endpoint(input, path), { method: "POST", headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  } catch {
    throw new InstagramPublishError("Instagram publishing transport failed; reconciliation is required before retry.", true, true);
  }
  return parseResponse(response);
}

export async function createInstagramImageContainer(input: InstagramPublishClientConfig & { controlledMediaUrl: string; caption?: string }) {
  const body = new URLSearchParams({ image_url: assertControlledMediaUrl(input.controlledMediaUrl) });
  if (input.caption) body.set("caption", input.caption);
  return idSchema.parse(await publishRequest(input, "media", body));
}

export async function publishInstagramContainer(input: InstagramPublishClientConfig & { creationId: string }) {
  const body = new URLSearchParams({ creation_id: input.creationId });
  return idSchema.parse(await publishRequest(input, "media_publish", body));
}

export async function publishInstagramImage(input: InstagramPublishClientConfig & { controlledMediaUrl: string; caption?: string }) {
  const container = await createInstagramImageContainer(input);
  const published = await publishInstagramContainer({ ...input, creationId: container.id });
  return { provider: "instagram", externalId: published.id, publishedAt: new Date().toISOString(), metadata: { containerId: container.id } };
}
