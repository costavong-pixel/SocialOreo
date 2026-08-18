import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  STAGING_ORIGIN,
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

const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${STAGING_ORIGIN}/auth/login`, { waitUntil: "domcontentloaded" });
  console.log("Complete the approved owner Google/Gmail login in the headed window. Do not enter payment details.");

  await page.waitForURL((url) => (
    url.origin === STAGING_ORIGIN
    && ["/", "/dashboard", "/home", "/credits"].includes(url.pathname)
  ), { timeout: 300000 });
  await page.goto(`${STAGING_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.getByText("Sign out", { exact: true }).waitFor({ state: "visible", timeout: 30000 });

  const state = await context.storageState();
  validateStorageStateData(state);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, {
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
