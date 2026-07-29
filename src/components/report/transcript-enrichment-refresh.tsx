"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TranscriptEnrichmentRefresh({ status }: { status?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "SUBMITTED") return;

    const timer = window.setInterval(() => router.refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [router, status]);

  return null;
}
