import { afterEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, { processedAt: Date | null; processingToken: string | null; processingStartedAt: Date | null }>();
const mockPrisma = {
  squareWebhookEvent: {
    create: vi.fn(async ({ data }) => {
      if (rows.has(data.squareEventId)) {
        const error = new Error("duplicate") as Error & { code: string };
        error.code = "P2002";
        throw error;
      }
      rows.set(data.squareEventId, { processedAt: null, processingToken: data.processingToken, processingStartedAt: data.processingStartedAt });
    }),
    findUnique: vi.fn(async ({ where }) => rows.get(where.squareEventId) ?? null),
    updateMany: vi.fn(async ({ where, data }) => {
      const row = rows.get(where.squareEventId);
      if (!row || (where.processedAt === null && row.processedAt !== null)) return { count: 0 };
      if (where.processingToken && row.processingToken !== where.processingToken) return { count: 0 };
      if (where.OR && !(row.processingStartedAt === null || row.processingStartedAt < where.OR[1]?.processingStartedAt?.lt)) return { count: 0 };
      rows.set(where.squareEventId, { ...row, ...data });
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }) => {
      const row = rows.get(where.squareEventId);
      if (!row || row.processingToken !== where.processingToken || row.processedAt !== null) return { count: 0 };
      rows.delete(where.squareEventId);
      return { count: 1 };
    }),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { claimSquareWebhookEvent, withSquareWebhookClaim } from "./checkout-service";

describe("Square webhook processing lease", () => {
  afterEach(() => { rows.clear(); vi.clearAllMocks(); });

  it("starts a new claim incomplete and marks it complete only after work succeeds", async () => {
    let sideEffects = 0;
    await expect(withSquareWebhookClaim({ eventId: "event-1", eventType: "payment.updated", rawBody: "{}" }, async () => { sideEffects += 1; return { ok: true }; }))
      .resolves.toEqual({ state: "processed", value: { ok: true } });
    expect(rows.get("event-1")?.processedAt).toBeInstanceOf(Date);
    expect(sideEffects).toBe(1);
  });

  it("ignores a completed duplicate without repeating side effects", async () => {
    await withSquareWebhookClaim({ eventId: "event-2", eventType: "payment.updated", rawBody: "{}" }, async () => ({ ok: true }));
    const work = vi.fn(async () => ({ ok: true }));
    await expect(withSquareWebhookClaim({ eventId: "event-2", eventType: "payment.updated", rawBody: "{}" }, work)).resolves.toEqual({ state: "completed" });
    expect(work).not.toHaveBeenCalled();
  });

  it("releases a failed claim so Square retry processes it once", async () => {
    await expect(withSquareWebhookClaim({ eventId: "event-3", eventType: "subscription.updated", rawBody: "{}" }, async () => { throw new Error("transient"); })).rejects.toThrow("transient");
    expect(rows.has("event-3")).toBe(false);
    await expect(withSquareWebhookClaim({ eventId: "event-3", eventType: "subscription.updated", rawBody: "{}" }, async () => ({ retried: true }))).resolves.toEqual({ state: "processed", value: { retried: true } });
  });

  it("does not execute concurrently and reclaims a stale incomplete lease", async () => {
    const first = await claimSquareWebhookEvent({ eventId: "event-4", eventType: "payment.updated", rawBody: "{}", now: new Date("2026-07-26T00:00:00Z") });
    expect(first.state).toBe("claimed");
    await expect(claimSquareWebhookEvent({ eventId: "event-4", eventType: "payment.updated", rawBody: "{}", now: new Date("2026-07-26T00:01:00Z") })).resolves.toEqual({ state: "processing" });
    await expect(claimSquareWebhookEvent({ eventId: "event-4", eventType: "payment.updated", rawBody: "{}", now: new Date("2026-07-26T00:06:00Z") })).resolves.toMatchObject({ state: "claimed" });
  });
});
