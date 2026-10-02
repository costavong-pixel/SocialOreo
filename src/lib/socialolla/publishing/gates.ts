import { providerDisabledEnabled } from "@/lib/providers/social/provider-guard";
import { platformCapabilities, platformGateEnvName, type PublishingPlatform } from "./platform-adaptation";

function exactProduction(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production" && env.SOCIALOLLA_ENV === "production";
}

export function postWorkerRuntimeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  const nodeEnvironment = env.NODE_ENV?.trim().toLowerCase();
  const socialollaEnvironment = env.SOCIALOLLA_ENV?.trim().toLowerCase();
  if (nodeEnvironment === "staging" && socialollaEnvironment === "staging") return true;
  return exactProduction(env) && env.SOCIALOLLA_PRODUCTION_POST_WORKER_ENABLED === "true";
}

/** Shared fail-closed Post gate; adapter credentials/eligibility are checked after it. */
export function postPublishingEnabled(platform: PublishingPlatform | string, env: Record<string, string | undefined> = process.env, hasMediaStorage = true): boolean {
  const capabilities = platformCapabilities(platform);
  if (!capabilities || !hasMediaStorage || !postWorkerRuntimeAllowed(env) || providerDisabledEnabled(env)) return false;
  return env[platformGateEnvName(capabilities.platform)] === "true";
}

/** Instagram OAuth connection is separately gated from Instagram publishing. */
export function instagramConnectionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return postWorkerRuntimeAllowed(env) && !providerDisabledEnabled(env) && env.SOCIALOLLA_INSTAGRAM_CONNECTION_ENABLED === "true";
}

export function platformPublishingGate(platform: PublishingPlatform | string, env: Record<string, string | undefined> = process.env): { platform: PublishingPlatform; envKey: string; enabled: boolean } {
  const capabilities = platformCapabilities(platform);
  if (!capabilities) throw new Error(`Unsupported publishing platform: ${platform}`);
  const envKey = platformGateEnvName(capabilities.platform);
  return { platform: capabilities.platform, envKey, enabled: env[envKey] === "true" };
}
