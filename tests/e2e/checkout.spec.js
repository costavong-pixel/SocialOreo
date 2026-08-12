import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const STAGING_ORIGIN = "https://staging.socialolla.com";
const SANDBOX_CHECKOUT_HOST = "sandbox.square.link";
const UNPINNED_OR_PRODUCTION_HOSTS = new Set([
  "square.link",
  "squareup.com",
  "checkout.squareup.com",
  "pay.squareup.com",
]);

const SESSION_COOKIE_FILE = process.env.SESSION_COOKIE_FILE?.trim() ?? "";
if (!SESSION_COOKIE_FILE) {
  throw new Error("SESSION_COOKIE_FILE is required and must be minted from the staging Auth0 app.");
}
const SESSION_COOKIE_PATH = path.resolve(SESSION_COOKIE_FILE);
const SESSION_COOKIE = fs.existsSync(SESSION_COOKIE_PATH)
  ? fs.readFileSync(SESSION_COOKIE_PATH, "utf8").trim()
  : "";

// This marker is deliberately non-secret. The runner must mint the raw
// __session value with the staging Auth0 app and staging AUTH0_SECRET, never a
// production secret, then set SESSION_COOKIE_PROVENANCE=staging-auth0.
const SESSION_COOKIE_PROVENANCE = process.env.SESSION_COOKIE_PROVENANCE ?? "";

if (!SESSION_COOKIE) {
  throw new Error("Staging checkout E2E requires SESSION_COOKIE_FILE minted from the staging Auth0 app.");
}
if (SESSION_COOKIE_PROVENANCE !== "staging-auth0") {
  throw new Error("Set SESSION_COOKIE_PROVENANCE=staging-auth0 after verifying the staging Auth0 mint source.");
}
if (SESSION_COOKIE_PATH === process.cwd() || SESSION_COOKIE_PATH.startsWith(`${process.cwd()}${path.sep}`)) {
  throw new Error("SESSION_COOKIE_FILE must remain outside the repository.");
}

function resolvedStagingOrigin(testInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright staging baseURL is missing.");
  return new URL(baseURL).origin;
}

async function addStagingSession(page, testInfo) {
  await page.context().addCookies([{
    name: "__session",
    value: SESSION_COOKIE,
    url: resolvedStagingOrigin(testInfo),
  }]);
}

async function openCheckout(page, offerName, apiPath) {
  // The public pricing links are the customer entry point; the authenticated
  // checkout buttons are intentionally reached through /credits.
  await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  const pricingLink = page.getByRole("link", { name: offerName, exact: true });
  await expect(pricingLink).toHaveAttribute("href", "/credits");
  await pricingLink.click();
  await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/credits", { timeout: 15000 });

  const apiResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(apiPath) && response.request().method() === "POST",
  );
  await expect(page.getByRole("button", { name: offerName, exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: offerName, exact: true }).click();

  const apiResponse = await apiResponsePromise;
  expect(apiResponse.status(), `${apiPath} must authorize the staging tester and create a sandbox link`).toBe(200);
  await page.waitForURL((url) => url.hostname === SANDBOX_CHECKOUT_HOST, { timeout: 45000 });

  const finalURL = new URL(page.url());
  expect(finalURL.protocol).toBe("https:");
  expect(finalURL.hostname).toBe(SANDBOX_CHECKOUT_HOST);
  expect(UNPINNED_OR_PRODUCTION_HOSTS.has(finalURL.hostname)).toBe(false);
}

test.describe("staging-only Square sandbox checkout acceptance", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }, testInfo) => {
    // This assertion runs before every page.goto. playwright.config.mjs also
    // rejects a non-staging BASE_URL at module load for every E2E spec.
    expect(resolvedStagingOrigin(testInfo)).toBe(STAGING_ORIGIN);
    await addStagingSession(page, testInfo);
  });

  test("Lifetime checkout reaches the sandbox-hosted page without payment completion", async ({ page }) => {
    await openCheckout(page, "Choose Lifetime", "/api/square/checkout");
  });

  test("Monthly checkout reaches the sandbox-hosted page without payment completion", async ({ page }) => {
    await openCheckout(page, "Choose Monthly", "/api/square/monthly/checkout");
  });
});
