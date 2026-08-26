import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { configureMock, pauseMock } = vi.hoisted(() => ({ configureMock: vi.fn(), pauseMock: vi.fn() }));

vi.mock("@/app/m2-actions", () => ({
  m2ConfigureWatch: configureMock,
  m2PauseWatch: pauseMock,
}));

import { WatchMonitorForm } from "./watch-monitor-form";

describe("WatchMonitorForm", () => {
  it("requires explicit confirmation before configuring a scheduled capture", () => {
    render(<WatchMonitorForm cost={2} providerDisabled monitors={[]} />);
    fireEvent.change(screen.getByLabelText("Instagram profile URL"), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Start tracking" }));
    expect(screen.getByRole("status").textContent).toContain("Confirm");
    expect(configureMock).not.toHaveBeenCalled();
  });

  it("shows provider-disabled truth and lets the owner pause an existing monitor", () => {
    render(<WatchMonitorForm cost={1} providerDisabled monitors={[{
      profileUrl: "https://www.instagram.com/example",
      platform: "instagram",
      provider: "apify",
      cadenceHours: 168,
      enabled: true,
      nextCaptureAt: null,
      lastCapturedAt: null,
      lastError: null,
      retryCount: 0,
      reportCount: 1,
    }]} />);
    expect(screen.getByText(/provider-disabled mode/)).toBeTruthy();
    expect(screen.getByText(/1 capture/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});
