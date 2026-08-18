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

  it("renders explicit Lifetime USD and Monthly CAD currencies", () => {
    render(
      <CheckoutButtons
        lifetimePriceCents={7900}
        lifetimeCurrency="USD"
        monthlyPriceCents={4900}
        monthlyCurrency="CAD"
      />,
    );

    expect(screen.getByText("$79")).toBeTruthy();
    expect(screen.getByText("CA$49")).toBeTruthy();
  });

  it("opens the Square hosted checkout link returned for Lifetime", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ checkoutUrl: "https://square.link/checkout-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons lifetimePriceCents={7900} lifetimeCurrency="USD" monthlyPriceCents={1900} monthlyCurrency="CAD" />);

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

    render(<CheckoutButtons lifetimePriceCents={7900} lifetimeCurrency="USD" monthlyPriceCents={1900} monthlyCurrency="CAD" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Monthly" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/square/monthly/checkout",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
    await vi.waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://square.link/monthly"));
  });

  it("shows the server error when checkout is not available (e.g. not authorized)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "Checkout is restricted to authorized accounts." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CheckoutButtons lifetimePriceCents={7900} lifetimeCurrency="USD" monthlyPriceCents={1900} monthlyCurrency="CAD" />);

    fireEvent.click(screen.getByRole("button", { name: "Choose Lifetime" }));

    expect(await screen.findByText("Checkout is restricted to authorized accounts.")).toBeTruthy();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("labels the purchase surface as Square-hosted", () => {
    render(<CheckoutButtons lifetimePriceCents={7900} lifetimeCurrency="USD" monthlyPriceCents={1900} monthlyCurrency="CAD" />);
    expect(screen.getByText(/Square-hosted checkout/)).toBeTruthy();
  });
});
