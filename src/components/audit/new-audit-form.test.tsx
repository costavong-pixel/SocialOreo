import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

import { NewAuditForm } from "./new-audit-form";

describe("NewAuditForm", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes server-provided Monthly availability to the full-audit purchase section", () => {
    render(<NewAuditForm monthlyAvailable />);

    fireEvent.change(screen.getByRole("textbox", { name: "Instagram or TikTok URL" }), { target: { value: "https://www.instagram.com/example/" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to campaign brief" }));
    fireEvent.click(screen.getByRole("radio", { name: "Full audit — 30 reels, 1 creditDeeper reel sample and scoring. Uses one credit from your balance." }));

    expect(screen.getByText("Monthly Competitor Board")).toBeTruthy();
  });
});
