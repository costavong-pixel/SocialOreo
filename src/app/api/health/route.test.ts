import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the safe staging release identity", async () => {
    vi.stubEnv("SOCIALOLLA_ENV", "staging");
    vi.stubEnv("SOCIALOLLA_REVISION", "ea218708bf26f7c96a2ea20871c74aa93ee40cab");
    vi.stubEnv("SOCIALOLLA_BUILD_TIMESTAMP", "2026-08-25T17:00:00.000Z");

    const body = await GET().json();

    expect(body).toEqual({
      ok: true,
      service: "socialolla",
      phase: "phase-1-foundation",
      environment: "staging",
      revision: "ea218708bf26f7c96a2ea20871c74aa93ee40cab",
      buildTimestamp: "2026-08-25T17:00:00.000Z",
    });
    expect(JSON.stringify(body)).not.toMatch(/[A-Za-z]:\\|\/home\/|\/srv\//);
  });

  it("fails safe when a release has no explicit identity", async () => {
    vi.stubEnv("SOCIALOLLA_ENV", "");
    vi.stubEnv("SOCIALOLLA_REVISION", "");
    vi.stubEnv("SOCIALOLLA_BUILD_TIMESTAMP", "");

    const body = await GET().json();

    expect(body.service).toBe("socialolla");
    expect(body.revision).toBe("unknown");
    expect(body.buildTimestamp).toBeNull();
  });
});
