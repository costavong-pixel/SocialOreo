import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PurchaseButtons } from "./purchase-buttons";

describe("PurchaseButtons", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Monthly Competitor Board from server-provided availability without a client availability request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<PurchaseButtons monthlyAvailable />);

    expect(screen.getByText("Monthly Competitor Board")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose Monthly Competitor Board" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not render Monthly Competitor Board when server availability is false", () => {
    render(<PurchaseButtons monthlyAvailable={false} />);

    expect(screen.queryByText("Monthly Competitor Board")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose Monthly Competitor Board" })).toBeNull();
  });
});
