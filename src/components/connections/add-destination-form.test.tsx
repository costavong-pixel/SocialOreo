import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { m2RunWatchMock } = vi.hoisted(() => ({ m2RunWatchMock: vi.fn() }));

vi.mock("@/app/m2-actions", () => ({
  m2RunWatch: m2RunWatchMock,
  m2AddDestination: vi.fn(),
  m2CreatePost: vi.fn(),
  m2FirstPostAndPlan: vi.fn(),
}));

import { WatchForm } from "./add-destination-form";

describe("WatchForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("does not run Watch until the user confirms the exact credit cost", async () => {
    m2RunWatchMock.mockResolvedValue({ status: "COMPLETED", reportExternalId: "wpr_1" });

    render(<WatchForm cost={2} batchAvailable />);

    fireEvent.change(screen.getByLabelText("Public profile URL"), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Watch cost" }));

    // Confirmation step shows exact cost; the action must NOT be called yet.
    expect(screen.getByText("Confirm exact cost")).toBeTruthy();
    expect(screen.getByText(/runs a provider-disabled analysis and consumes/)).toBeTruthy();
    expect(m2RunWatchMock).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", { name: "Confirm and run Watch" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);

    expect(m2RunWatchMock).toHaveBeenCalledWith("https://www.instagram.com/example/", "instagram", true);
  });

  it("shows the provider-disabled batch unavailability when no spendable batch exists", () => {
    render(<WatchForm cost={1} batchAvailable={false} />);

    fireEvent.change(screen.getByLabelText("Public profile URL"), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Watch cost" }));

    expect(screen.getByText(/no spendable batch is currently available/)).toBeTruthy();
  });

  it("lets the user go back from the confirm step without running", () => {
    render(<WatchForm />);

    fireEvent.change(screen.getByLabelText("Public profile URL"), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Watch cost" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(m2RunWatchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Preview Watch cost" })).toBeTruthy();
  });
});
