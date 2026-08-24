import { NextResponse } from "next/server";
import { createContentFactoryClient } from "@/lib/socialolla/content-factory/client";

export async function GET() {
  try {
    const contentFactory = await createContentFactoryClient().health();
    const ok = contentFactory.status === "ok" && contentFactory.contract === "v1" && contentFactory.data_reachable;
    return NextResponse.json(
      { ok, service: "socialoreo", phase: "real-post-staging", content_factory: contentFactory },
      { status: ok ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "socialoreo",
        phase: "real-post-staging",
        content_factory: { status: "error", contract: "v1", data_reachable: false },
        error: error instanceof Error ? error.message : "Content Factory health check failed",
      },
      { status: 503 },
    );
  }
}
