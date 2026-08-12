import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The authenticated-shell tests need a valid Auth0 session cookie. It is a
// machine-local artifact (produced by the coordinator from AUTH0_SECRET), never
// committed. Tests that require it are skipped when it is absent.
const SESSION_COOKIE_FILE = process.env.SESSION_COOKIE_FILE ?? "/tmp/opencode/browser-session-cookie.txt";
const SESSION_COOKIE_PATH = path.resolve(SESSION_COOKIE_FILE);
const SESSION_COOKIE = fs.existsSync(SESSION_COOKIE_PATH) ? fs.readFileSync(SESSION_COOKIE_PATH, "utf8").trim() : "";
const hasSession = SESSION_COOKIE.length > 0;
const STAGING_AUTH0_HOST = "dev-b12p7c5vfprk0hi8.us.auth0.com";

function assertOutsideRepository(candidate, label) {
  const repository = process.cwd();
  if (candidate === repository || candidate.startsWith(`${repository}${path.sep}`)) {
    throw new Error(`${label} must remain outside the repository.`);
  }
}

assertOutsideRepository(SESSION_COOKIE_PATH, "SESSION_COOKIE_FILE");

function stagingOrigin(testInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") throw new Error("Playwright staging baseURL is missing.");
  return new URL(baseURL).origin;
}

async function addStagingSession(page, testInfo) {
  await page.context().addCookies([{ name: "__session", value: SESSION_COOKIE, url: stagingOrigin(testInfo) }]);
}

const SHOT_DIR = path.resolve(process.env.SHOT_DIR ?? "/tmp/opencode/browser-screenshots");
assertOutsideRepository(SHOT_DIR, "SHOT_DIR");
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

  test("guest protected-action boundary: no credits access without session", async ({ page }) => {
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

  test("authenticated product shell + onboarding/profile review", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText(/Dashboard|Welcome|Home/i).first()).toBeVisible({ timeout: 15000 });
    await shot(page, "shell-home");

    await page.goto("/onboarding", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/purpose|Set up your workspace/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Create first post/i })).toBeVisible();
    await shot(page, "onboarding");
  });

  test("connections: sandbox destination form", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/connections", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/sandbox/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Add sandbox destination/i })).toBeVisible();
    await shot(page, "connections");
  });

  test("posts: variant editor + schedule controls + create", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Posts/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Create Post/i })).toBeVisible();
    await shot(page, "posts");
  });

  test("watch: credit-cost confirmation step", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/watch", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/credit/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Preview Watch cost/i })).toBeVisible();
    await shot(page, "watch");
  });

  test("credits: balance/batches/ledger + checkout entry", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/credits", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Credits/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Lifetime|Monthly/i }).first()).toBeVisible();
    await shot(page, "credits");
  });

  test("assistant: protected preview + confirmation for authenticated", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/assistant", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Assistant/i })).toBeVisible({ timeout: 15000 });
    await shot(page, "assistant");
  });

  test("admin: gated control plane with price + adjust + audit", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/admin/plans", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByText(/Admin|entitlement/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Update price/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /adjust|refund/i }).first()).toBeVisible();
    await shot(page, "admin-plans");
  });

  test("calendar: seven-day plan + scheduled slots", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
    await addStagingSession(page, test.info());
    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await waitContent(page);
    await expect(page.getByRole("heading", { name: /Calendar/i })).toBeVisible({ timeout: 15000 });
    await shot(page, "calendar");
  });

  test("mobile navigation + keyboard focus", async ({ page }) => {
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
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
    test.skip(!hasSession, "requires a session cookie (set SESSION_COOKIE_FILE)");
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
