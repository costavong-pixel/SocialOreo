import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { m2SchedulePostMock, refreshMock } = vi.hoisted(() => ({
  m2SchedulePostMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/m2-actions", () => ({ m2SchedulePost: m2SchedulePostMock }));

import { ScheduleControl } from "./schedule-control";

const destination = { externalId: "dst_1", label: "Work Instagram", platform: "instagram", status: "DISCONNECTED", providerDisabled: true };

describe("ScheduleControl", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALOLLA_PROVIDER_DISABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("shows the staging delivery notice with a UTC conversion", () => {
    render(<ScheduleControl postExternalId="req_1" destinationRef="dst_1" destinations={[destination]} occurrences={[]} slots={[]} />);

    expect(screen.getByText(/not enabled in staging/)).toBeTruthy();
    expect(screen.getByText(/Pick a date and timezone/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Schedule for (local time)"), { target: { value: "2026-08-10T15:30" } });
    fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "UTC" } });

    expect(screen.getByText(/stored UTC/)).toBeTruthy();
  });

  it("does not schedule until a datetime is chosen, then calls m2SchedulePost with the ISO instant", async () => {
    m2SchedulePostMock.mockResolvedValue({ status: "SCHEDULED" });
    render(<ScheduleControl postExternalId="req_1" destinationRef="dst_1" destinations={[destination]} occurrences={[]} slots={[]} />);

    const scheduleButton = screen.getByRole("button", { name: "Approve & schedule" }) as HTMLButtonElement;
    expect(scheduleButton.disabled).toBe(true);
    expect(m2SchedulePostMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Schedule for (local time)"), { target: { value: "2026-08-10T15:30" } });
    expect(scheduleButton.disabled).toBe(false);

    fireEvent.click(scheduleButton);

    expect(await screen.findByText(/Durable schedule persisted; live delivery is not enabled in staging/)).toBeTruthy();
    expect(m2SchedulePostMock).toHaveBeenCalledWith({
      postRequestExternalId: "req_1",
      scheduleAt: "2026-08-10T15:30:00.000Z",
      timezone: "UTC",
    });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("lists scheduled slots with destination status / evidence labels", () => {
    const slot = { id: "slot-1", destinationRef: "dst_1", scheduleAt: "2026-08-10T15:30:00.000Z", timezone: "UTC", createdAt: "2026-08-04T00:00:00.000Z" };
    render(<ScheduleControl postExternalId="req_1" destinationRef="dst_1" destinations={[destination]} occurrences={[]} slots={[slot]} />);

    expect(screen.getByText("Scheduled slots:")).toBeTruthy();
    expect(screen.getByText(/UTC · status/)).toBeTruthy();
    expect(screen.getByText("SCHEDULED")).toBeTruthy();
    expect(screen.getByText(/durable schedule persisted/)).toBeTruthy();
  });
});
