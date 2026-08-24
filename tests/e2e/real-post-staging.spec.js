import { test, expect } from "@playwright/test";
import { addStagingSession, resolveAuthState } from "./auth-state.mjs";

const enabled = process.env.REAL_INSTAGRAM_STAGING_ACCEPTANCE === "true";
const hasApprovedAuthState = Boolean(resolveAuthState());

test.describe("SOCIALOLLA_REAL_POST_STAGING_GATE", () => {
  test("normal USER can complete the real Instagram Post journey", async ({ page }) => {
    test.skip(!enabled, "requires REAL_INSTAGRAM_STAGING_ACCEPTANCE=true; live provider calls are never enabled by default");
    test.skip(!hasApprovedAuthState, "requires an owner-supplied external staging storageState");
    await addStagingSession(page, test.info());

    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /Posts?/i }).first()).toBeVisible();
    await page.goto("/connections", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /Connect Instagram for publishing/i })).toBeVisible();

    // OAuth consent and the staging/test Meta account remain owner-controlled.
    // This assertion proves the real route is present; it does not replace the
    // owner consent step with a mock token.
    const connectHref = await page.getByRole("link", { name: /Connect Instagram for publishing/i }).getAttribute("href");
    expect(connectHref).toBe("/api/meta/instagram/publish/connect");

    await page.goto("/posts", { waitUntil: "domcontentloaded" });
    const destination = page.locator("select#dst");
    await expect(destination).toBeVisible();
    const destinationOptions = await destination.locator("option").count();
    expect(destinationOptions).toBeGreaterThan(0);

    // One valid JPEG fixture, kept in memory so no uploaded customer media is
    // committed to the repository.
    const onePixelJpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Af//Z", "base64");
    await page.locator("input#post-media").setInputFiles({ name: "staging-post.jpg", mimeType: "image/jpeg", buffer: onePixelJpeg });
    await expect(page.getByText(/Media attached/)).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Create Post", exact: true }).click();
    await expect(page.getByText(/Reload-safe database row created/)).toBeVisible({ timeout: 30000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Posts/i })).toBeVisible();
    await page.getByRole("button", { name: "Publish now" }).last().click();
    await expect(page.getByText(/Publish result: PUBLISHED/)).toBeVisible({ timeout: 120000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/provider post/)).toBeVisible({ timeout: 30000 });
  });
});
