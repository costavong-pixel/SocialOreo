import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const STAGING_ORIGIN = "https://staging.socialolla.com";
// The sandbox short URL that the application returns and stores, and the
// sandbox-only host Square redirects it to after checkout starts. Both are
// explicitly approved; every other Square host is rejected.
const SANDBOX_SHORT_LINK_HOST = "sandbox.square.link";
const SANDBOX_HOSTED_CHECKOUT_HOST = "connect.squareupsandbox.com";
// Pinned sandbox paths: the /u/ short-link path on SANDBOX_SHORT_LINK_HOST and
// Square's sandbox hosted-checkout/testing-panel path on the redirect host.
const SANDBOX_SHORT_LINK_PATH_PREFIX = "/u/";
const SANDBOX_HOSTED_CHECKOUT_PATH_PREFIX = "/v2/online-checkout/sandbox-testing-panel/";
const PRODUCTION_OR_UNPINNED_HOSTS = new Set([
  "square.link",
  "www.square.link",
  "squareup.com",
  "www.squareup.com",
  "connect.squareup.com",
  "checkout.square.site",
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

// Proof 1: the URL the application returns (and stores server-side) must be
// the sandbox short URL: https on hostname sandbox.square.link.
function assertSandboxShortCheckoutUrl(checkoutUrl) {
  const url = new URL(checkoutUrl);
  expect(url.protocol).toBe("https:");
  expect(url.hostname).toBe(SANDBOX_SHORT_LINK_HOST);
  expect(PRODUCTION_OR_UNPINNED_HOSTS.has(url.hostname)).toBe(false);
}

// Proof 2: after following Square redirects, the browser must remain on an
// explicitly approved sandbox-only host/path. The final host may be either the
// approved sandbox short-link host (pinned to /u/) or the approved sandbox
// hosted-checkout testing-panel host (pinned to its testing-panel path).
// Production/unpinned hosts are rejected before the path is considered.
function assertApprovedSandboxFinalUrl(rawUrl) {
  const url = new URL(rawUrl);
  expect(url.protocol, "checkout must remain on https").toBe("https:");
  expect(
    PRODUCTION_OR_UNPINNED_HOSTS.has(url.hostname),
    `sandbox checkout reached a production/unpinned Square host: ${url.hostname}`,
  ).toBe(false);

  if (url.hostname === SANDBOX_HOSTED_CHECKOUT_HOST) {
    expect(
      url.pathname.startsWith(SANDBOX_HOSTED_CHECKOUT_PATH_PREFIX),
      `sandbox testing-panel host must stay on the hosted-checkout testing panel path (got ${url.pathname})`,
    ).toBe(true);
    return;
  }
  if (url.hostname === SANDBOX_SHORT_LINK_HOST) {
    expect(
      url.pathname.startsWith(SANDBOX_SHORT_LINK_PATH_PREFIX),
      `sandbox short-link host must stay on the /u/ short-link path (got ${url.pathname})`,
    ).toBe(true);
    return;
  }
  throw new Error(`Checkout ended on an unapproved host: ${url.hostname}`);
}

function isApprovedSandboxHost(url) {
  return url.protocol === "https:" && (url.hostname === SANDBOX_SHORT_LINK_HOST || url.hostname === SANDBOX_HOSTED_CHECKOUT_HOST);
}

async function openCheckout(page, offerName, apiPath) {
  // The public pricing links are the customer entry point; the authenticated
  // checkout buttons are intentionally reached through /credits.
  await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  const pricingLink = page.getByRole("link", { name: offerName, exact: true });
  await expect(pricingLink).toHaveAttribute("href", "/credits");
  await pricingLink.click();
  await page.waitForURL((url) => url.origin === STAGING_ORIGIN && url.pathname === "/credits", { timeout: 15000 });

  const sandboxLinkRequestPromise = page.waitForRequest((request) => {
    try {
      return new URL(request.url()).hostname === SANDBOX_SHORT_LINK_HOST;
    } catch {
      return false;
    }
  }, { timeout: 45000 });
  const apiResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(apiPath) && response.request().method() === "POST",
  );
  await expect(page.getByRole("button", { name: offerName, exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: offerName, exact: true }).click();

  const apiResponse = await apiResponsePromise;
  expect(apiResponse.status(), `${apiPath} must authorize the staging tester and create a sandbox link`).toBe(200);
  const payload = await apiResponse.json();
  const checkoutUrl = payload.checkoutUrl;
  expect(typeof checkoutUrl, `${apiPath} must return the sandbox checkoutUrl`).toBe("string");
  assertSandboxShortCheckoutUrl(checkoutUrl);

  // The browser must be sent to exactly the short URL the application
  // returned/stored, never a rewritten or substituted host.
  const sandboxLinkRequest = await sandboxLinkRequestPromise;
  expect(sandboxLinkRequest.url()).toBe(checkoutUrl);

  // After Square redirects, execution must remain on an approved sandbox host.
  await page.waitForURL((url) => isApprovedSandboxHost(url), { timeout: 45000 });
  assertApprovedSandboxFinalUrl(page.url());
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
