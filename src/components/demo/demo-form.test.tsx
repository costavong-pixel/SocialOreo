import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { m2DemoMock } = vi.hoisted(() => ({ m2DemoMock: vi.fn() }));

vi.mock("@/app/m2-actions", () => ({ m2Demo: m2DemoMock }));

import { DemoForm } from "./demo-form";

const demoResult = {
  label: "DEMO" as const,
  title: "baking — demo title abcd",
  caption: "This is a DEMO title/caption.",
  canEdit: true,
  canCopy: true,
  transferRequiresConsent: true,
  price: "$79",
};

describe("DemoForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders an editable, copyable result for a first-visit demo", async () => {
    m2DemoMock.mockResolvedValue({ status: "ok", reRun: false, demo: demoResult });

    render(<DemoForm signedIn={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate demo" }));

    const titleInput = await screen.findByLabelText("Title");
    expect((titleInput as HTMLInputElement).value).toBe(demoResult.title);
    fireEvent.change(titleInput, { target: { value: "edited title" } });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("edited title");
    expect(screen.getByRole("button", { name: "Copy title" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy caption" })).toBeTruthy();
    expect(m2DemoMock).toHaveBeenCalledWith("baking");
  });

  it("shows already-used state for a repeat anonymous visitor and does not fake-fail", async () => {
    m2DemoMock.mockResolvedValue({ status: "already-used", signedIn: false });

    render(<DemoForm signedIn={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Generate demo" }));

    expect(await screen.findByText(/Already used — sign in to continue/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("shows consent-gated transfer messaging for a signed-in visitor", async () => {
    m2DemoMock.mockResolvedValue({ status: "ok", reRun: true, demo: demoResult });

    render(<DemoForm signedIn />);

    fireEvent.click(screen.getByRole("button", { name: "Generate demo" }));

    const consent = await screen.findByRole("checkbox");
    expect(screen.getByText(/stays on this device until you consent/)).toBeTruthy();

    fireEvent.click(consent);

    expect(screen.getByText(/your edited title and caption can be copied into your workspace/)).toBeTruthy();
  });
});
