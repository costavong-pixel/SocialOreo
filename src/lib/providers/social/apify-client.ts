import { normalizeApifyActorId } from "./normalize-apify-actor-id";

const APIFY_BASE_URL = "https://api.apify.com/v2";

export type ApifyRunResult = {
  items: Record<string, unknown>[];
  runId: string;
  datasetId: string;
};

export type ApifyRunMetadata = {
  runId: string;
  datasetId: string;
};

export type ApifyRunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT" | string;

export type RunApifyActorOptions = {
  token: string;
  actorId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export class ApifyClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApifyClientError";
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startApifyActor(options: Pick<RunApifyActorOptions, "token" | "actorId" | "input">): Promise<ApifyRunMetadata> {
  const normalizedActorId = normalizeApifyActorId(options.actorId);
  const encodedActorId = encodeURIComponent(normalizedActorId);

  const runResponse = await fetch(`${APIFY_BASE_URL}/acts/${encodedActorId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
    body: JSON.stringify(options.input),
  });

  if (!runResponse.ok) {
    throw new ApifyClientError(`Apify actor run failed with status ${runResponse.status}.`, runResponse.status);
  }

  const runPayload = (await runResponse.json()) as {
    data?: { id?: string; defaultDatasetId?: string };
  };

  const runId = runPayload.data?.id;
  const datasetId = runPayload.data?.defaultDatasetId;

  if (!runId || !datasetId) {
    throw new ApifyClientError("Apify actor run response was missing run metadata.");
  }

  return { runId, datasetId };
}

export async function getApifyRunStatus(options: Pick<RunApifyActorOptions, "token"> & { runId: string }): Promise<ApifyRunStatus> {
  const statusResponse = await fetch(`${APIFY_BASE_URL}/actor-runs/${options.runId}`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });

  if (!statusResponse.ok) {
    throw new ApifyClientError(`Apify status check failed with status ${statusResponse.status}.`, statusResponse.status);
  }

  const statusPayload = (await statusResponse.json()) as {
    data?: { status?: string };
  };

  return statusPayload.data?.status ?? "UNKNOWN";
}

export async function getApifyDatasetItems(options: Pick<RunApifyActorOptions, "token"> & { datasetId: string }): Promise<Record<string, unknown>[]> {
  const datasetResponse = await fetch(`${APIFY_BASE_URL}/datasets/${options.datasetId}/items`, {
    headers: { Authorization: `Bearer ${options.token}` },
  });

  if (!datasetResponse.ok) {
    throw new ApifyClientError(`Apify dataset fetch failed with status ${datasetResponse.status}.`, datasetResponse.status);
  }

  return (await datasetResponse.json()) as Record<string, unknown>[];
}

export async function runApifyActor(options: RunApifyActorOptions): Promise<ApifyRunResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const { runId, datasetId } = await startApifyActor(options);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getApifyRunStatus({ token: options.token, runId });

    if (status === "SUCCEEDED") {
      const items = await getApifyDatasetItems({ token: options.token, datasetId });
      return { items, runId, datasetId };
    }

    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new ApifyClientError(`Apify actor run ended with status ${status}.`);
    }

    await wait(pollIntervalMs);
  }

  throw new ApifyClientError("Apify actor run timed out.");
}
