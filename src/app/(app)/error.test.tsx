import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import M2AppError from "./error";

describe("authenticated application error", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/home");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates and displays a support reference without sending the raw error", async () => {
    const reset = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ incidentReference: "INC-1234567890" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const error = Object.assign(new Error("private customer error and stack"), { digest: "safe-digest" });

    render(<M2AppError error={error} reset={reset} />);

    expect(await screen.findByText(/INC-1234567890/)).toBeInTheDocument();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(String(request.body)).toContain("safe-digest");
    expect(String(request.body)).not.toContain("private customer error");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("normalizes route before reporting incidents", async () => {
    const reset = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ incidentReference: "INC-1234567890" }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const error = new Error("runtime error");

    window.history.replaceState({}, "", "/analysis/abc");
    render(<M2AppError error={error} reset={reset} />);

    const request = await waitFor(() => fetchMock.mock.calls[0]?.[1] as RequestInit);
    const body = request?.body as BodyInit;

    expect(String(body)).toContain('"route":"/analysis"');
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("keeps retry available when incident reporting is unavailable", async () => {
    const reset = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    render(<M2AppError error={new Error("failure")} reset={reset} />);

    await waitFor(() => expect(screen.getByText(/could not create a support reference/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
