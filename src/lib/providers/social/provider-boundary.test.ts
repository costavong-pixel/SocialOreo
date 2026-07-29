import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const srcRoot = join(process.cwd(), "src");
const forbiddenImportPattern = /from\s+["']@\/lib\/providers\/social\/apify-instagram-provider["']/;
const allowedFiles = new Set([
  "lib/providers/social/provider-router.ts",
  "lib/providers/social/apify-instagram-provider.ts",
  "lib/providers/social/apify-instagram-provider.test.ts",
  "lib/audit/run-audit.ts",
]);

function collectTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relativePath = relative(srcRoot, fullPath).split(sep).join("/");

    if (statSync(fullPath).isDirectory()) {
      if (entry === "node_modules") {
        continue;
      }

      collectTsFiles(fullPath, files);
      continue;
    }

    if (relativePath.endsWith(".ts") || relativePath.endsWith(".tsx")) {
      files.push(relativePath);
    }
  }

  return files;
}

describe("provider adapter boundary", () => {
  it("does not import the Apify adapter outside the router and provider layer", () => {
    const violations = collectTsFiles(srcRoot).filter((file) => {
      if (allowedFiles.has(file)) {
        return false;
      }

      const source = readFileSync(join(srcRoot, file), "utf8");
      return forbiddenImportPattern.test(source);
    });

    expect(violations).toEqual([]);
  });
});
