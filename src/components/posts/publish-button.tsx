"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { m2PublishPost } from "@/app/m2-actions";

export function PublishButton({ postRequestExternalId }: { postRequestExternalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="mt-3 flex items-center gap-2"><button type="button" disabled={busy} onClick={async () => { setBusy(true); setMessage(null); try { const result = await m2PublishPost({ postRequestExternalId }); setMessage(`Publish result: ${result.status}`); router.refresh(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Publish failed"); } finally { setBusy(false); } }} className="rounded-full border border-emerald-300/40 px-4 py-2 text-sm font-extrabold text-emerald-200 disabled:opacity-50">Publish now</button>{message ? <p role="status" className="text-sm text-white/70">{message}</p> : null}</div>;
}
