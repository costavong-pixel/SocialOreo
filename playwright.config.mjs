import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3006",
    headless: true,
  },
  reporter: [["list"]],
});
