import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutButtons } from "./checkout-buttons";

const { assignMock } = vi.hoisted(() => ({ assignMock: vi.fn() }));

Object.defineProperty(window, "location", {
  configurable: true,
  value: { assign: assignMock, href: "" },
});

describe("CheckoutButtons", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    assignMock.mockClear();
  });

  it("opens the Square hosted checkout link returned for Lifetime", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ checkoutUrl: "https://square.link/checkout-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons lifetimePriceCents={7900} monthlyPriceCents={1900} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Lifetime" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/square/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ product: "lifetime" }),
      }),
    );
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://square.link/checkout-1"));
  });

  it("POSTs the Monthly route without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ checkoutUrl: "https://square.link/monthly" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons lifetimePriceCents={7900} monthlyPriceCents={1900} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Monthly" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/square/monthly/checkout",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://square.link/monthly"));
  });

  it("shows the server error when checkout is not available (e.g. not a tester)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "Sandbox checkout is limited to testers." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons lifetimePriceCents={7900} monthlyPriceCents={1900} />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Lifetime" }));

    expect(await screen.findByText("Sandbox checkout is limited to testers.")).toBeTruthy();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("labels the purchase surface as sandbox-only", () => {
    render(<CheckoutButtons lifetimePriceCents={7900} monthlyPriceCents={1900} />);
    expect(screen.getByText(/Sandbox checkout only/)).toBeTruthy();
  });
});
