export type ReleaseEnvironment = "development" | "test" | "staging" | "production";

export type ReleaseIdentity = {
  environment: ReleaseEnvironment;
  revision: string;
  buildTimestamp: string | null;
};

function firstConfigured(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return null;
}

function getEnvironment(): ReleaseEnvironment {
  const configured = process.env.SOCIALOLLA_ENV?.trim().toLowerCase();

  if (
    configured === "development" ||
    configured === "test" ||
    configured === "staging" ||
    configured === "production"
  ) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export function getReleaseIdentity(): ReleaseIdentity {
  return {
    environment: getEnvironment(),
    revision: firstConfigured("SOCIALOLLA_REVISION", "RELEASE_GIT_SHA") ?? "unknown",
    buildTimestamp: firstConfigured("SOCIALOLLA_BUILD_TIMESTAMP", "RELEASE_BUILD_TIMESTAMP"),
  };
}
