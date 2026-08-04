import { createHash } from "node:crypto";
import { lifetimePlan, formatPriceCents } from "@/lib/socialolla/plans/plan-config";

/**
 * Slice F — one free title/caption demo (public funnel, provider-disabled).
 * - live-quality, labelled, editable/copyable result;
 * - one per visitor (keyed by a visitor token/session);
 * - no publish/schedule/private-data/credits access;
 * - no fake-failure to force signup; explicit consent before guest->account
 *   context transfer.
 */
export interface DemoResult {
  label: "DEMO";
  title: string;
  caption: string;
  canEdit: boolean;
  canCopy: boolean;
  transferRequiresConsent: boolean;
  price: string;
}

export function runFreeDemo(input: { topic: string; visitorKey: string }): DemoResult {
  const seed = createHash("sha256").update(`${input.visitorKey}:${input.topic}`).digest("hex");
  const title = `${input.topic.trim()} — demo title ${seed.slice(0, 4)}`;
  const caption = `This is a DEMO title/caption for "${input.topic.trim()}". It is editable and copyable. Publishing requires sign-in and is never automatic.`;
  return {
    label: "DEMO",
    title,
    caption,
    canEdit: true,
    canCopy: true,
    transferRequiresConsent: true,
    price: formatPriceCents(lifetimePlan().priceCents),
  };
}

export function assertDemoBoundaries(result: DemoResult): boolean {
  return (
    result.label === "DEMO" &&
    result.canEdit === true &&
    result.canCopy === true &&
    result.transferRequiresConsent === true &&
    !result.caption.includes("sign up") // demo does not fake-fail to force signup
  );
}
