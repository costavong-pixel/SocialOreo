import { defineConfig } from "@playwright/test";
import { resolveAuthState } from "./tests/e2e/auth-state.mjs";

const STAGING_ORIGIN = "https://staging.socialolla.com";

function resolveStagingBaseURL(value) {
  const configured = value?.trim() || STAGING_ORIGIN;
  let url;

  try {
    url = new URL(configured);
  } catch {
    throw new Error(`Playwright BASE_URL must be exactly ${STAGING_ORIGIN}; received an invalid URL.`);
  }

  // This is intentionally an exact origin check. It rejects production,
  // localhost, alternate ports, credentials, paths, and query-string targets
  // before Playwright can create a page or issue a navigation.
  if (
    url.origin !== STAGING_ORIGIN ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(`Playwright BASE_URL must be exactly ${STAGING_ORIGIN}; refusing ${url.origin}.`);
  }

  return STAGING_ORIGIN;
}

const baseURL = resolveStagingBaseURL(process.env.BASE_URL);
const authState = resolveAuthState();

const use = {
  baseURL,
  headless: true,
  trace: "retain-on-failure",
  video: "retain-on-failure",
};

// A storageState is a normal Playwright context fixture. It is applied to the
// suite here, while the guest-boundary test explicitly overrides it with an
// empty state. The legacy raw cookie remains a per-test fallback.
if (authState?.kind === "storageState") {
  use.storageState = authState.path;
}

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/create-staging-storage-state.mjs"],
  timeout: 60000,
  retries: 0,
  outputDir: "./test-results",
  use,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
});
