import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  STAGING_ORIGIN,
  STAGING_AUTH0_HOST,
  assertExternalAuthArtifactPath,
  validateStorageStateData,
  validateStorageStateFile,
} from "./auth-state.mjs";

const outputArgument = process.argv[2];

if (!outputArgument || outputArgument === "--help") {
  console.error("Usage: node tests/e2e/create-staging-storage-state.mjs <external-output-path>");
  process.exit(outputArgument === "--help" ? 0 : 1);
}

const outputPath = assertExternalAuthArtifactPath(outputArgument, {
  label: "storageState output",
});

if (fs.existsSync(outputPath)) {
  throw new Error("storageState output already exists; choose a new external path rather than overwriting an auth artifact.");
}

function resolveLocalCdpUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("PLAYWRIGHT_CDP_URL must be a local HTTP URL such as http://127.0.0.1:9222.");
  }
  if (
    url.protocol !== "http:"
    || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("PLAYWRIGHT_CDP_URL must target only a local HTTP endpoint with no credentials or path.");
  }
  return url.toString();
}

function isApprovedCookieHost(cookie) {
  let host = "";
  if (typeof cookie.url === "string") {
    try {
      host = new URL(cookie.url).hostname;
    } catch {
      return false;
    }
  } else if (typeof cookie.domain === "string") {
    host = cookie.domain.replace(/^\./, "");
  }
  host = host.toLowerCase();
  return host === new URL(STAGING_ORIGIN).hostname || host === new URL(`https://${STAGING_AUTH0_HOST}`).hostname;
}

function isApprovedOrigin(origin) {
  return origin === STAGING_ORIGIN || origin === `https://${STAGING_AUTH0_HOST}`;
}

const cdpUrl = process.env.PLAYWRIGHT_CDP_URL?.trim();
let browser;
let context;

// Google may reject OAuth from Playwright's bundled Chromium as an
// unsupported browser. Use the installed, user-facing Chrome channel for
// this one-time interactive login; do not add automation-evasion flags.
if (cdpUrl) {
  browser = await chromium.connectOverCDP(resolveLocalCdpUrl(cdpUrl));
  context = browser.contexts()[0];
} else {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL?.trim() || "chrome",
    headless: false,
  });
  context = await browser.newContext();
}

if (!context) {
  await browser.close();
  throw new Error("PLAYWRIGHT_CDP_URL connected but exposed no browser context.");
}

try {
  const page = await context.newPage();
  await page.goto(`${STAGING_ORIGIN}/auth/login`, { waitUntil: "domcontentloaded" });
  console.log(
    cdpUrl
      ? "Complete the approved owner Google/Gmail login manually in the normal Chrome window. Do not enter payment details."
      : "Complete the approved owner Google/Gmail login in the headed window. Do not enter payment details.",
  );

  await page.waitForURL((url) => (
    url.origin === STAGING_ORIGIN
    && ["/", "/dashboard", "/home", "/credits"].includes(url.pathname)
  ), { timeout: 300000 });
  await page.goto(`${STAGING_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByText("Sign out", { exact: true }).waitFor({ state: "visible", timeout: 30000 });

  const state = await context.storageState();
  const stagingState = {
    cookies: state.cookies.filter(isApprovedCookieHost),
    origins: state.origins.filter((entry) => isApprovedOrigin(entry.origin)),
  };
  validateStorageStateData(stagingState);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${JSON.stringify(stagingState, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  fs.chmodSync(outputPath, 0o600);
  validateStorageStateFile(outputPath);
  console.log(`Approved staging storageState written with mode 0600: ${outputPath}`);
} finally {
  await browser.close();
}
