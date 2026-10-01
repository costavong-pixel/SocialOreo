import { describe, expect, it, vi } from "vitest";
import { consumePendingOAuthState, createPendingOAuthState, pkceChallenge } from "./oauth-state";

describe("shared OAuth state", () => {
  it("creates an S256 PKCE pair", () => {
    const verifier = "verifier-value";
    expect(pkceChallenge(verifier)).toBe("GPXfFfmq30W8w5PWMLNtzZR2q9pxnxZ4FkY2A8xIsF4");
  });

  it("binds state to provider/user/redirect and consumes it once", async () => {
    vi.stubEnv("SOCIALOLLA_OAUTH_STATE_SECRET", "test-state-secret");
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      oAuthState: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { rows.push({ id: "state_1", ...data }); return rows.at(-1); }),
        findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) => rows.find((row) => row.stateHash === where.stateHash) ?? null),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; consumedAt: null }; data: Record<string, unknown> }) => {
          const row = rows.find((candidate) => candidate.id === where.id && (candidate.consumedAt === null || candidate.consumedAt === undefined));
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    } as never;
    const created = await createPendingOAuthState({ userId: "user_1", provider: "facebook", redirectUri: "https://socialolla.com/api/connections/facebook/callback", supportsPkce: true, db, now: new Date("2026-09-30T00:00:00.000Z") });
    expect(created.codeChallenge).toBeTruthy();
    await expect(consumePendingOAuthState({ state: created.state, userId: "user_1", provider: "threads", redirectUri: "https://socialolla.com/api/connections/facebook/callback", db, now: new Date("2026-09-30T00:01:00.000Z") })).resolves.toBeNull();
    const consumed = await consumePendingOAuthState({ state: created.state, userId: "user_1", provider: "facebook", redirectUri: "https://socialolla.com/api/connections/facebook/callback", db, now: new Date("2026-09-30T00:01:00.000Z") });
    expect(consumed?.codeVerifier).toBeTruthy();
    await expect(consumePendingOAuthState({ state: created.state, userId: "user_1", provider: "facebook", redirectUri: "https://socialolla.com/api/connections/facebook/callback", db, now: new Date("2026-09-30T00:01:00.000Z") })).resolves.toBeNull();
    vi.unstubAllEnvs();
  });

  it("rejects an expired callback before any token exchange can begin", async () => {
    vi.stubEnv("SOCIALOLLA_OAUTH_STATE_SECRET", "test-state-secret");
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      oAuthState: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { rows.push({ id: "state_2", consumedAt: null, ...data }); return rows.at(-1); }),
        findUnique: vi.fn(async ({ where }: { where: { stateHash: string } }) => rows.find((row) => row.stateHash === where.stateHash) ?? null),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    } as never;
    const created = await createPendingOAuthState({ userId: "user_2", provider: "google_business", redirectUri: "https://socialolla.com/api/connections/google_business/callback", supportsPkce: true, db, now: new Date("2026-09-30T00:00:00.000Z") });
    await expect(consumePendingOAuthState({ state: created.state, userId: "user_2", provider: "google_business", redirectUri: "https://socialolla.com/api/connections/google_business/callback", db, now: new Date("2026-09-30T00:11:00.000Z") })).resolves.toBeNull();
    vi.unstubAllEnvs();
  });
});
