import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cancelMock, rescheduleMock, refreshMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  rescheduleMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/m2-actions", () => ({
  m2CancelPublishJob: cancelMock,
  m2ReschedulePublishJob: rescheduleMock,
}));

import { DeliveryControls } from "./delivery-controls";

describe("DeliveryControls", () => {
  beforeEach(() => {
    cancelMock.mockResolvedValue({ canceled: true });
    rescheduleMock.mockResolvedValue({ status: "SCHEDULED" });
  });

  afterEach(() => vi.clearAllMocks());

  it("cancels a queued delivery and refreshes the durable state", async () => {
    render(<DeliveryControls jobs={[{ id: "job-1", status: "QUEUED", scheduledFor: "2026-09-03T20:06:00.000Z", attemptCount: 0 }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel scheduled delivery" }));

    expect(await screen.findByText("Scheduled delivery canceled.")).toBeTruthy();
    expect(cancelMock).toHaveBeenCalledWith("job-1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("retries a failed delivery at an explicit UTC time", async () => {
    render(<DeliveryControls jobs={[{ id: "job-2", status: "FAILED", scheduledFor: null, attemptCount: 1 }]} />);
    fireEvent.change(screen.getByLabelText("Retry at (UTC)"), { target: { value: "2026-09-03T20:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry failed delivery" }));

    expect(await screen.findByText("Failed delivery queued for retry.")).toBeTruthy();
    expect(rescheduleMock).toHaveBeenCalledWith({ jobId: "job-2", scheduledFor: "2026-09-03T20:30:00.000Z", timezone: "UTC" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("reschedules a canceled delivery without creating a new job action", async () => {
    render(<DeliveryControls jobs={[{ id: "job-3", status: "CANCELED", scheduledFor: null, attemptCount: 0 }]} />);
    fireEvent.change(screen.getByLabelText("Reschedule at (UTC)"), { target: { value: "2026-09-03T20:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Reschedule canceled delivery" }));

    expect(await screen.findByText("Canceled delivery rescheduled.")).toBeTruthy();
    expect(rescheduleMock).toHaveBeenCalledWith({ jobId: "job-3", scheduledFor: "2026-09-03T20:45:00.000Z", timezone: "UTC" });
  });
});
