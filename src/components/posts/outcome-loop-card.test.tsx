import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { confirmPublicationMock, recordMetricsMock, decideRecommendationMock, schedulePostMock, refreshMock } = vi.hoisted(() => ({
  confirmPublicationMock: vi.fn(),
  recordMetricsMock: vi.fn(),
  decideRecommendationMock: vi.fn(),
  schedulePostMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/m2-actions", () => ({
  m2ConfirmManualPublication: confirmPublicationMock,
  m2RecordOutcomeMetrics: recordMetricsMock,
  m2DecideOutcomeRecommendation: decideRecommendationMock,
  m2SchedulePost: schedulePostMock,
}));

import { OutcomeLoopCard, type OutcomeLoopCardData } from "./outcome-loop-card";

const unrecordedVersion: OutcomeLoopCardData = {
  externalId: "ocv_test",
  platform: "instagram",
  approvedAt: "2026-08-09T12:00:00.000Z",
  publication: null,
  metricSnapshots: [],
  evaluation: null,
  recommendation: null,
};

const readyVersion: OutcomeLoopCardData = {
  ...unrecordedVersion,
  publication: {
    externalId: "ocp_test",
    platformPostUrl: "https://www.instagram.com/reel/abc123",
    publishedAt: "2026-08-09T12:00:00.000Z",
    confirmedAt: "2026-08-09T12:01:00.000Z",
  },
  metricSnapshots: [{ id: "ms-1", capturedAt: "2026-08-13T11:00:00.000Z", views: 1_500, likes: 180, comments: 0, shares: 0, saves: 0, reach: null }],
  evaluation: {
    status: "READY",
    decision: "KEEP",
    confidence: 60,
    summary: "Comparative evidence is ready.",
    evidence: {
      scope: "manual-platform-metrics",
      caveat: "Comparative signal only; this does not prove that the content caused the result.",
      current: { snapshotCount: 2, observationSpanHours: 24, publishedAgeHours: 96, views: 1_500, visibleInteractionRate: 0.12 },
      baseline: { sampleSize: 3, medianViews: 1_000, medianVisibleInteractionRate: 0.1 },
      limitations: [],
    },
  },
  recommendation: {
    externalId: "orp_test",
    status: "PENDING_APPROVAL",
    plan: {
      focus: "Keep this direction.",
      preserve: ["The topic"],
      test: "Test one hook.",
      approvalBoundary: "Owner approval is required before any separate draft or schedule action.",
    },
  },
};

describe("OutcomeLoopCard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("explains that no immutable version exists until the final variant is approved and scheduled", () => {
    render(<OutcomeLoopCard outcome={null} />);
    expect(screen.getByText(/preserve an immutable content version/)).toBeTruthy();
  });

  it("requires an explicit manual-publication confirmation before it records an external post", async () => {
    confirmPublicationMock.mockResolvedValue({ reused: false, platformPostUrl: "https://www.instagram.com/reel/abc123" });
    render(<OutcomeLoopCard outcome={unrecordedVersion} />);

    const confirm = screen.getByRole("button", { name: "Confirm manual publication" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Direct instagram post URL/i), { target: { value: "https://www.instagram.com/reel/abc123" } });
    fireEvent.change(screen.getByLabelText(/Published at/i), { target: { value: "2026-08-09T12:00" } });
    fireEvent.click(screen.getByLabelText(/I confirm this is the direct post URL/i));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect(await screen.findByText(/Manual publication recorded/)).toBeTruthy();
    expect(confirmPublicationMock).toHaveBeenCalledWith(expect.objectContaining({ contentVersionExternalId: "ocv_test", confirmed: true }));
    expect(schedulePostMock).not.toHaveBeenCalled();
  });

  it("records recommendation approval only and never triggers scheduling", async () => {
    decideRecommendationMock.mockResolvedValue({ status: "APPROVED", generated: false, scheduled: false, published: false });
    render(<OutcomeLoopCard outcome={readyVersion} />);

    const approve = screen.getByRole("button", { name: "Approve next-plan recommendation" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I approve this recommendation as a planning input only/i));
    fireEvent.click(approve);

    expect(await screen.findByText(/No draft, schedule, publication, or provider call was created/)).toBeTruthy();
    expect(decideRecommendationMock).toHaveBeenCalledWith({ recommendationExternalId: "orp_test", decision: "APPROVED", confirmed: true });
    expect(schedulePostMock).not.toHaveBeenCalled();
  });
});
