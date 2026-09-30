import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { m2RunWatchMock, m2CreatePostMock, m2CreateMultiDestinationPostMock } = vi.hoisted(() => ({ m2RunWatchMock: vi.fn(), m2CreatePostMock: vi.fn(), m2CreateMultiDestinationPostMock: vi.fn() }));

vi.mock("@/app/m2-actions", () => ({
  m2RunWatch: m2RunWatchMock,
  m2AddDestination: vi.fn(),
  m2CreatePost: m2CreatePostMock,
  m2CreateMultiDestinationPost: m2CreateMultiDestinationPostMock,
  m2FirstPostAndPlan: vi.fn(),
}));

import { CreatePostForm, WatchForm } from "./add-destination-form";

describe("WatchForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("does not run Watch until the user confirms the exact credit cost", async () => {
    m2RunWatchMock.mockResolvedValue({ status: "COMPLETED", reportExternalId: "wpr_1" });

    render(<WatchForm cost={2} batchAvailable />);

    fireEvent.change(screen.getByLabelText("Public profile URL"), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview Watch cost" }));

    // Confirmation step shows exact cost; the action must NOT be called yet.
    expect(screen.getByText("Confirm exact cost")).toBeTruthy();
    expect(screen.getByText(/One Basic Profile Analysis/).parentElement?.textContent).toContain("uses 2 credits");
    expect(m2RunWatchMock).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", { name: "Confirm and run Watch" }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);

    expect(m2RunWatchMock).toHaveBeenCalledWith("https://www.instagram.com/example/", "instagram", true);
  });

  it("shows batch unavailability when no spendable batch exists", () => {
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

describe("CreatePostForm", () => {
  it("directs a customer without a connection to Connections instead of asking for an internal id", () => {
    render(<CreatePostForm />);

    expect(screen.getByText("Connect an account to create your first Post.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Connections" }).getAttribute("href")).toBe("/connections");
    expect(screen.queryByLabelText("Destination external id")).toBeNull();
    expect(screen.queryByText("Add sandbox destination")).toBeNull();
  });

  it("selects a connected account when creating a local draft", () => {
    render(<CreatePostForm destinations={[{ externalId: "dst_1", label: "Work Instagram", platform: "Instagram" }]} />);

    expect(screen.getByLabelText("Connected account")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create draft" })).toBeTruthy();
    expect(screen.queryByLabelText("Destination external id")).toBeNull();
  });

  it("queues one shared request for multiple selected platforms", async () => {
    m2CreateMultiDestinationPostMock.mockResolvedValue({ postRequestId: "post_1", status: "REVIEW" });
    render(<CreatePostForm destinations={[
      { externalId: "dst_1", label: "Work Facebook", platform: "facebook" },
      { externalId: "dst_2", label: "Work LinkedIn", platform: "linkedin" },
    ]} />);

    fireEvent.click(screen.getByLabelText("Select Work LinkedIn"));
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));

    await waitFor(() => expect(m2CreateMultiDestinationPostMock).toHaveBeenCalledWith({
      destinationExternalIds: ["dst_1", "dst_2"],
      language: "en",
      requestedCount: 10,
      contentIntent: "post",
      mediaAssetIds: [],
    }));
    expect(m2CreatePostMock).not.toHaveBeenCalled();
  });
});
