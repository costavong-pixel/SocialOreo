import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { m2AssistantRespondMock } = vi.hoisted(() => ({ m2AssistantRespondMock: vi.fn() }));

vi.mock("@/app/m2-actions", () => ({ m2AssistantRespond: m2AssistantRespondMock }));

import { AssistantPanel } from "./assistant-panel";

describe("AssistantPanel", () => {
  afterEach(() => vi.clearAllMocks());

  it("warns a guest that Execute is restricted before sending", () => {
    render(<AssistantPanel authenticated={false} />);

    fireEvent.change(screen.getByLabelText("What would you like to do?"), { target: { value: "publish the first post" } });

    expect(screen.getByText(/Execute is restricted to signed-in users/)).toBeTruthy();
    expect(m2AssistantRespondMock).not.toHaveBeenCalled();
  });

  it("submits the intent and domain to the server action for a signed-in user", async () => {
    m2AssistantRespondMock.mockResolvedValue({ action: "Explain", summary: "Prepared an Explain response for onboarding.", requiresConfirmation: false, transcript: "explain how credits work" });
    render(<AssistantPanel authenticated />);

    fireEvent.change(screen.getByLabelText("What would you like to do?"), { target: { value: "explain how credits work" } });
    fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "credits_and_costs" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(m2AssistantRespondMock).toHaveBeenCalledWith({ intent: "explain how credits work", domain: "credits_and_costs" });
    expect(await screen.findByText(/Prepared an Explain response/)).toBeTruthy();
    expect(screen.getByText(/Sanitized transcript:/)).toBeTruthy();
  });

  it("offers an exact-preview confirmation step for a protected Execute", async () => {
    m2AssistantRespondMock
      .mockResolvedValueOnce({
        action: "Execute",
        summary: "Protected action prepared — exact preview and confirmation required.",
        requiresConfirmation: true,
        confirmationToken: "so-ok-token-1",
        transcript: "publish the first post",
      })
      .mockResolvedValueOnce({ action: "Execute", summary: "Execute confirmed.", blocked: false, transcript: "publish the first post preview" });

    render(<AssistantPanel authenticated />);

    fireEvent.change(screen.getByLabelText("What would you like to do?"), { target: { value: "publish the first post" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const confirmButton = await screen.findByRole("button", { name: "Confirm execute" });
    expect(confirmButton).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Exact preview"), { target: { value: "Publish caption X" } });
    fireEvent.click(confirmButton);

    expect(await screen.findByText("Execute confirmed.")).toBeTruthy();
    expect(m2AssistantRespondMock).toHaveBeenLastCalledWith({
      intent: "publish the first post",
      domain: "onboarding",
      providedToken: "so-ok-token-1",
      expectedToken: "so-ok-token-1",
      preview: "Publish caption X",
    });
  });
});
