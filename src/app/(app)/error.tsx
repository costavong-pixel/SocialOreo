"use client";

import { useEffect, useState } from "react";

import { shellStateLabel } from "@/lib/socialolla/shell/shell";

type IncidentState =
  | { status: "reporting" }
  | { status: "recorded"; reference: string }
  | { status: "unavailable" };

function newClientEventId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const tail = Date.now().toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}

export default function M2AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [clientEventId] = useState(newClientEventId);
  const [incident, setIncident] = useState<IncidentState>({ status: "reporting" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function report() {
      try {
        const response = await fetch("/api/support/incidents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientEventId,
            route: window.location.pathname,
            ...(error.digest ? { digest: error.digest } : {}),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("incident-report-unavailable");
        const body = await response.json() as { incidentReference?: unknown };
        if (typeof body.incidentReference !== "string" || !/^INC-[A-F0-9]{10}$/.test(body.incidentReference)) {
          throw new Error("incident-reference-invalid");
        }
        if (active) setIncident({ status: "recorded", reference: body.incidentReference });
      } catch {
        if (active && !controller.signal.aborted) setIncident({ status: "unavailable" });
      }
    }

    void report();
    return () => {
      active = false;
      controller.abort();
    };
  }, [clientEventId, error.digest]);

  return (
    <div role="alert" className="grid min-h-[40dvh] place-items-center">
      <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-5 text-center">
        <p className="font-display text-lg font-extrabold">{shellStateLabel("error")}</p>
        <p className="mt-1 text-sm text-white/60">You can retry, or check your connection and try again.</p>
        <p className="mt-3 text-xs text-white/50" aria-live="polite">
          {incident.status === "reporting" ? "Creating a support reference…" : null}
          {incident.status === "recorded" ? <>Support reference: <strong className="text-white/80">{incident.reference}</strong></> : null}
          {incident.status === "unavailable" ? "We could not create a support reference. You can still retry." : null}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-full bg-[var(--social-blue)] px-5 py-2.5 text-sm font-extrabold text-[var(--social-ink)] hover:bg-[#cdbbff]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
