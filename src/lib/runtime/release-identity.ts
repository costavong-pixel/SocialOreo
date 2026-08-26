export type ReleaseEnvironment = "development" | "test" | "staging" | "production";

export type ReleaseIdentity = {
  environment: ReleaseEnvironment;
  revision: string;
  buildTimestamp: string | null;
};

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
    revision: process.env.SOCIALOLLA_REVISION?.trim() || "unknown",
    buildTimestamp: process.env.SOCIALOLLA_BUILD_TIMESTAMP?.trim() || null,
  };
}
