import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  STAGING_AUTH0_HOST,
  addStagingSession,
  assertExternalAuthArtifactPath,
  resolveAuthState,
} from "./auth-state.mjs";

const hasApprovedAuthState = Boolean(resolveAuthState());

function stagingOrigin(testInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright staging baseURL is missing.");
  return new URL(baseURL).origin;
}

const SHOT_DIR = assertExternalAuthArtifactPath(
  process.env.SHOT_DIR ?? "/tmp/opencode/browser-screenshots",
  { label: "SHOT_DIR" },
);
fs.mkdirSync(SHOT_DIR, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
}

// Wait until the shell's Loading… indicator disappears and content is stable.
async function waitContent(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
  const loading = page.locator("main").getByText(/Loading…|Loading\.\.\./i);
  if (await loading.count()) {
    await loading.first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function assertCanonicalSocialOllaShell(page) {
  const nav = page.locator('nav[aria-label="Primary"]');
  await expect(nav).toBeVisible();
  for (const label of [/Dashboard/i, /Posts?/i, /Watch/i, /Calendar/i, /Connections/i, /Credits/i, /Analysis/i, /Assistant/i, /Settings/i]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  const body = await page.locator("body").innerText();
  expect(body).toContain("SocialOlla");
  expect(body).not.toContain("SocialOreo");
  expect(body).not.toContain("SOCIALOREO");
  expect(body).not.toContain("Run your first audit to unlock the dashboard");
}

test.describe("SocialOlla M2 browser acceptance (provider-disabled)", () => {
  test("public landing: Post-first, canonical $79 offer", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Plan|post|watch/i);
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/\$79/);
    await expect(page.getByRole("link", { name: /Try the free demo/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /See pricing/i })).toBeVisible();
    await shot(page, "landing");
  });

  test("pricing: canonical $79 lifetime + monthly", async ({ page }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/\$79/);
    await shot(page, "pricing");
  });

  test("free demo: editable, copyable, consent, guest protected-action boundary", async ({ page }) => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await page.getByLabel(/What are you posting about/i).fill("coffee shop");
    await page.getByRole("button", { name: /Generate demo/i }).click();
    await expect(page.getByLabel(/^Title$/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel(/^Caption$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy title/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy caption/i })).toBeVisible();
    await expect(page.getByText(/DEMO/i).first()).toBeVisible();
    await shot(page, "demo");
  });

  test.describe("guest protected-action boundary", () => {
    // playwright.config.mjs may provide an authenticated storageState to the
    // suite. This test must always start without it.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("no credits access without session", async ({ page }) => {
      await page.goto("/credits", { waitUntil: "domcontentloaded" });
      // The live staging app redirects through /auth/login into its staging
      // Auth0 tenant. Keep the tenant pin so a production or unexpected issuer
      // cannot satisfy this guest-boundary assertion.
      await page.waitForURL((url) =>
        url.hostname === STAGING_AUTH0_HOST &&
        (/\/u\/login|\/authorize/.test(url.pathname)),
        { timeout: 15000 },
      );
      const url = page.url();
      expect(/\/credits/.test(url)).toBe(false);
      await shot(page, "guest-boundary-redirect");
    });
  });

  test("authenticated product shell + onboarding/profile review", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await assertCanonicalSocialOllaShell(page);
    await expect(page.getByText(/Dashboard|Welcome|Home/i).first()).toBeVisible({ timeout: 15000 });
    await shot(page, "shell-home");

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/purpose|Set up your workspace/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Create first post/i })).toBeVisible();
    await shot(page, "onboarding");
  });

  test("canonical routes reject the legacy shell and preserve Analysis entry points", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home(?:\?|$)/);
    await waitContent(page);
    await assertCanonicalSocialOllaShell(page);

    await page.goto("/post", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/posts(?:\?|$)/);
    await waitContent(page);
    await assertCanonicalSocialOllaShell(page);

    await page.goto("/analysis", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await assertCanonicalSocialOllaShell(page);
    await expect(page.getByRole("heading", { name: /Profile Analysis/i })).toBeVisible();
    await shot(page, "analysis");

    await page.goto("/analysis/new", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await assertCanonicalSocialOllaShell(page);
    await expect(page.getByRole("heading", { name: /Create a profile analysis/i })).toBeVisible();
    await shot(page, "analysis-new");
  });

  test("canonical navigation reaches every route on the first click", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());

    const links = [
      ["Dashboard", "/home"],
      ["Posts", "/posts"],
      ["Watch", "/watch"],
      ["Calendar", "/calendar"],
      ["Connections", "/connections"],
      ["Credits", "/credits"],
      ["Analysis", "/analysis"],
      ["Assistant", "/assistant"],
      ["Settings", "/settings"],
    ];

    for (const [label, expectedPath] of links) {
      await page.goto("/analysis", { waitUntil: "domcontentloaded" });
      await waitContent(page);
      const link = page.locator('nav[aria-label="Primary"]').getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 15000 });
      await waitContent(page);
      await assertCanonicalSocialOllaShell(page);
    }
  });

  test("visual canonical shell capture covers every customer route", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    const routes = ["home", "posts", "watch", "calendar", "connections", "credits", "analysis", "assistant", "settings"];
    for (const route of routes) {
      await page.goto(`/${route}`, { waitUntil: "domcontentloaded" });
      await waitContent(page);
      await assertCanonicalSocialOllaShell(page);
      await shot(page, `canonical-${route}`);
    }
  });

  test("connections: honest provider availability", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/connections", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Live social OAuth connections are not enabled/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Instagram" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add sandbox destination/i })).toHaveCount(0);
    await shot(page, "connections");
  });

  test("posts: variant editor + schedule controls + create", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Posts/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Connect an account to create your first Post|Connected account/i).first()).toBeVisible();
    await expect(page.getByText(/Destination external id/i)).toHaveCount(0);
    await shot(page, "posts");
  });

  test("watch: credit-cost confirmation step", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/watch", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    await expect(page.getByText(/credit/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Preview Watch cost/i })).toBeVisible();
    await shot(page, "watch");
  });

  test("credits: balance/batches/ledger + checkout entry", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/credits", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Credits/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Lifetime|Monthly/i }).first()).toBeVisible();
    await shot(page, "credits");
  });

  test("assistant: protected preview + confirmation for authenticated", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/assistant", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Assistant/i })).toBeVisible({ timeout: 15000 });
    await shot(page, "assistant");
  });

  test("admin: gated control plane with price + adjust + audit", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/admin/plans", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Admin|entitlement/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Update price/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /adjust|refund/i }).first()).toBeVisible();
    await shot(page, "admin-plans");
  });

  test("calendar: seven-day plan + scheduled slots", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Calendar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/provider-disabled/i)).toHaveCount(0);
    await shot(page, "calendar");
  });

  test("mobile navigation + keyboard focus", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await page.setViewportSize({ width: 390, height: 844 });
    await addStagingSession(page, test.info());
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.locator("nav").first()).toBeVisible();
    await shot(page, "mobile-home");
    await page.keyboard.press("Tab");
    await shot(page, "keyboard-focus");
  });

  test("language selector + RTL rendering", async ({ page }) => {
    test.skip(!hasApprovedAuthState, "requires PLAYWRIGHT_STORAGE_STATE or the legacy staging cookie fallback");
    await addStagingSession(page, test.info());
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("combobox", { name: "Interface language" })).toBeVisible({ timeout: 15000 });
    await page.context().addCookies([{ name: "so_locale", value: "ar-SA", url: stagingOrigin(test.info()) }]);
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    const htmlDir = await page.locator("html").getAttribute("dir");
    expect(htmlDir).toBe("rtl");
    await shot(page, "rtl-ar");
  });
});
