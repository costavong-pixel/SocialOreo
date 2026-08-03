import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  confirmExecute,
  costExplanation,
  newConfirmationToken,
  runAssistantStep,
  sanitizeTranscript,
} from "./assistant";

describe("Slice G — unified assistant contract", () => {
  it("classifies actions into Explain, Draft, ProposeAction, and Execute", () => {
    expect(classifyIntent("explain how credits work", "credits_and_costs")).toBe("Explain");
    expect(classifyIntent("draft a post", "post_assistance")).toBe("Draft");
    expect(classifyIntent("propose a profile change", "profile_maintenance")).toBe("ProposeAction");
    expect(classifyIntent("execute the published post", "post_assistance")).toBe("Execute");
  });

  it("covers the required assistant domains", () => {
    const domains = [
      "onboarding",
      "profile_maintenance",
      "post_assistance",
      "watch_assistance",
      "credits_and_costs",
      "failures_and_notifications",
      "support_escalation",
    ];
    for (const domain of domains) {
      const step = runAssistantStep("explain", domain as never);
      expect(step.domain).toBe(domain);
    }
  });

  it("marks Execute as a protected action requiring confirmation", () => {
    const step = runAssistantStep("publish the first post", "post_assistance");
    expect(step.action).toBe("Execute");
    expect(step.protectedAction).toBe(true);
    expect(step.requiresConfirmation).toBe(true);
    expect(step.confirmationToken).toBeDefined();
  });

  it("does not mutate anything for Explain or Draft", () => {
    const explain = runAssistantStep("explain", "onboarding");
    const draft = runAssistantStep("draft a plan", "onboarding");
    expect(explain.protectedAction).toBe(false);
    expect(explain.requiresConfirmation).toBe(false);
    expect(draft.protectedAction).toBe(false);
  });

  it("requires an exact preview and matching token before Execute", () => {
    const step = runAssistantStep("publish the first post", "post_assistance");
    const token = step.confirmationToken!;
    const wrong = confirmExecute({
      domain: "post_assistance",
      action: "Execute",
      preview: "Publish caption X to @costa.studio",
      confirmationToken: token,
      providedToken: "wrong",
    });
    expect(wrong.ok).toBe(false);
    const right = confirmExecute({
      domain: "post_assistance",
      action: "Execute",
      preview: "Publish caption X to @costa.studio",
      confirmationToken: token,
      providedToken: token,
    });
    expect(right.ok).toBe(true);
  });

  it("never invents prices or amounts in cost explanations", () => {
    const text = costExplanation({ estimatedCredits: 1, batchAvailable: true, remainingAfter: 19 });
    expect(text).toContain("1 credit");
    expect(text).toContain("19");
    expect(text).not.toMatch(/\$\d/);
  });

  it("sanitizes secrets, chain-of-thought, raw payloads, and cross-account ids from transcripts", () => {
    const raw = `
      reasoning: let me think
      step 1: inspect
      Authorization: Bearer sk-abcdefghijklmnop
      api_key=topsecret
      auth0|user-12345 belongs to another workspace
      ${'{"raw_payload":{"token":"secret"}}'}
    `;
    const safe = sanitizeTranscript(raw);
    expect(safe).not.toMatch(/sk-[A-Za-z0-9]{16,}/);
    expect(safe).not.toMatch(/topsecret/);
    expect(safe).not.toMatch(/auth0\|/);
    expect(safe).not.toMatch(/reasoning:|step 1:/);
    expect(safe).not.toContain("raw_payload");
  });

  it("issues unique confirmation tokens", () => {
    expect(newConfirmationToken()).toMatch(/^so-ok-/);
    expect(newConfirmationToken()).not.toBe(newConfirmationToken());
  });
});
