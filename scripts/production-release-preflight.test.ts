import { afterEach, describe, expect, it, vi } from "vitest";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { tmpdir } from "node:os";

// @ts-expect-error The operational release module is native ESM JavaScript executed directly by Node.
import { runReleasePreflight, runRollbackVerification } from "./production-release-preflight.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await makeTreeWritable(directory).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

const revisions = {
  previous: "1111111111111111111111111111111111111111",
  current: "2222222222222222222222222222222222222222",
  candidate: "3333333333333333333333333333333333333333",
};

const buildTimestamp = "2026-09-12T12:00:00.000Z";
const releaseTimestamp = "2026-09-12T12-00-00.000Z";
const releaseDirectoryNames = {
  previous: `${revisions.previous}-${releaseTimestamp}`,
  current: `${revisions.current}-${releaseTimestamp}`,
  candidate: `${revisions.candidate}-${releaseTimestamp}`,
};

async function makeTreeReadOnly(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) await makeTreeReadOnly(child);
    if (entry.isFile()) await chmod(child, 0o444);
  }));
  await chmod(directory, 0o555);
}

async function makeTreeWritable(directory: string) {
  await chmod(directory, 0o755);
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) await makeTreeWritable(child);
    if (entry.isFile()) await chmod(child, 0o644);
  }));
}

async function createRelease(releasesDirectory: string, revision: string, {
  manifest = true,
  directoryName = `${revision}-${releaseTimestamp}`,
  readOnly = true,
} = {}) {
  const releaseDirectory = join(releasesDirectory, directoryName);
  await mkdir(join(releaseDirectory, ".next"), { recursive: true });
  await mkdir(join(releaseDirectory, "node_modules"), { recursive: true });
  await writeFile(join(releaseDirectory, "package.json"), JSON.stringify({
    name: "socialoreo",
    version: "0.1.0",
    dependencies: {
      next: "16.3.3",
      react: "latest",
      "@prisma/client": "6.19.3",
    },
  }));
  await mkdir(join(releaseDirectory, "node_modules", "next"), { recursive: true });
  await mkdir(join(releaseDirectory, "node_modules", "react"), { recursive: true });
  await mkdir(join(releaseDirectory, "node_modules", "@prisma", "client"), { recursive: true });
  await writeFile(join(releaseDirectory, "node_modules", "next", "package.json"), JSON.stringify({ name: "next", version: "16.3.3" }));
  await writeFile(join(releaseDirectory, "node_modules", "react", "package.json"), JSON.stringify({ name: "react", version: "19.0.0" }));
  await writeFile(join(releaseDirectory, "node_modules", "@prisma", "client", "package.json"), JSON.stringify({ name: "@prisma/client", version: "6.19.3" }));
  await writeFile(join(releaseDirectory, ".next", "BUILD_ID"), `build-${revision}`);
  if (manifest) {
    await writeFile(join(releaseDirectory, "release-manifest.json"), JSON.stringify({
      revision,
      environment: "production",
      buildTimestamp,
    }));
  }
  if (readOnly) await makeTreeReadOnly(releaseDirectory);
  return releaseDirectory;
}

async function createLayout() {
  const root = await mkdtemp(join(tmpdir(), "socialolla-release-preflight-test-"));
  temporaryDirectories.push(root);
  const releasesDirectory = join(root, "releases");
  await mkdir(releasesDirectory);
  const previousDirectory = await createRelease(releasesDirectory, revisions.previous, { directoryName: releaseDirectoryNames.previous });
  const currentDirectory = await createRelease(releasesDirectory, revisions.current, { directoryName: releaseDirectoryNames.current });
  const candidateDirectory = await createRelease(releasesDirectory, revisions.candidate, { directoryName: releaseDirectoryNames.candidate });
  const currentLink = join(root, "current");
  const previousLink = join(root, "previous");
  await symlink(previousDirectory, previousLink, "junction");
  await symlink(currentDirectory, currentLink, "junction");
  const sharedDirectory = join(root, "shared");
  const productionEnvPath = join(sharedDirectory, "production.env");
  await mkdir(sharedDirectory);
  await writeFile(productionEnvPath, "SOCIALOLLA_ENV=production\n");
  return {
    root,
    releasesDirectory,
    previousDirectory,
    currentDirectory,
    candidateDirectory,
    currentLink,
    previousLink,
    productionEnvPath,
  };
}

async function createFirstDeployLayout() {
  const layout = await createLayout();
  await rm(layout.currentLink);
  await rm(layout.previousLink);
  return layout;
}

function healthResponse(payload: Record<string, unknown>) {
  return {
    ok: true,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(payload),
  };
}

function productionInput(layout: Awaited<ReturnType<typeof createLayout>>) {
  return {
    releasesDir: layout.releasesDirectory,
    releaseDir: layout.candidateDirectory,
    currentLink: layout.currentLink,
    previousLink: layout.previousLink,
    socialollaEnvironment: "production",
    nodeEnvironment: "production",
    providerDisabled: "true",
    revision: revisions.candidate,
    buildTimestamp,
    productionEnvPath: layout.productionEnvPath,
  };
}

describe("production release preflight", () => {
  it("accepts a complete immutable candidate and leaves links untouched", async () => {
    const layout = await createLayout();
    const beforeCurrent = await realpath(layout.currentLink);
    const beforePrevious = await realpath(layout.previousLink);

    await expect(runReleasePreflight(productionInput(layout))).resolves.toMatchObject({
      mode: "release-preflight",
      ready: true,
      candidateRevision: revisions.candidate,
      currentRevision: revisions.current,
      previousRevision: revisions.previous,
      providerDisabled: true,
      symlinksUnchanged: true,
      databaseAction: "not-performed",
      providerAction: "not-performed",
    });

    expect(await realpath(layout.currentLink)).toBe(beforeCurrent);
    expect(await realpath(layout.previousLink)).toBe(beforePrevious);
  });

  it("supports an explicit FIRST_DEPLOY with no links and reports no rollback", async () => {
    const layout = await createFirstDeployLayout();

    await expect(runReleasePreflight({
      ...productionInput(layout),
      mode: "FIRST_DEPLOY",
    })).resolves.toMatchObject({
      mode: "first-deploy",
      deploymentMode: "FIRST_DEPLOY",
      ready: true,
      currentRevision: null,
      previousRevision: null,
      rollbackAvailable: false,
    });

    await expect(lstat(layout.currentLink)).rejects.toThrow();
    await expect(lstat(layout.previousLink)).rejects.toThrow();
  });

  it("supports the second release while the first release has no rollback target", async () => {
    const layout = await createFirstDeployLayout();
    await symlink(layout.currentDirectory, layout.currentLink, "junction");

    await expect(runReleasePreflight({
      ...productionInput(layout),
      mode: "first-deploy",
    })).resolves.toMatchObject({
      mode: "first-deploy",
      deploymentMode: "FIRST_DEPLOY",
      currentRevision: revisions.current,
      previousRevision: null,
      rollbackAvailable: false,
    });
  });

  it("retains strict current/previous validation for normal deployments", async () => {
    const layout = await createLayout();
    await rm(layout.previousLink);

    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/symbolic link|parent path/);
  });

  it("fails closed for an out-of-root previous target even in FIRST_DEPLOY mode", async () => {
    const layout = await createFirstDeployLayout();
    const outsideRelease = await createRelease(layout.root, revisions.previous);
    await symlink(outsideRelease, layout.previousLink, "junction");

    await expect(runReleasePreflight({
      ...productionInput(layout),
      mode: "FIRST_DEPLOY",
    })).rejects.toThrow(/releases directory/);
  });

  it("fails closed for broken and non-symbolic previous targets", async () => {
    const broken = await createFirstDeployLayout();
    await symlink(broken.previousDirectory, broken.previousLink, "junction");
    await makeTreeWritable(broken.previousDirectory);
    await rm(broken.previousDirectory, { recursive: true, force: true });
    await expect(runReleasePreflight({
      ...productionInput(broken),
      mode: "FIRST_DEPLOY",
    })).rejects.toThrow(/target|release/);

    const nonSymbolic = await createFirstDeployLayout();
    await writeFile(nonSymbolic.previousLink, "not-a-symbolic-link\n");
    await expect(runReleasePreflight({
      ...productionInput(nonSymbolic),
      mode: "FIRST_DEPLOY",
    })).rejects.toThrow(/symbolic link|parent path/);
  });

  it("accepts timestamp-suffixed releases but validates the SHA and timestamp independently", async () => {
    const layout = await createLayout();
    const invalidRevision = `${"a".repeat(39)}z`;
    const invalidDirectory = await createRelease(layout.releasesDirectory, invalidRevision);

    await expect(runReleasePreflight({
      ...productionInput(layout),
      releaseDir: invalidDirectory,
      revision: invalidRevision,
    })).rejects.toThrow(/40-character hexadecimal/);

    await expect(runReleasePreflight({
      ...productionInput(layout),
      revision: "a".repeat(39),
    })).rejects.toThrow(/40-character hexadecimal/);

    const mismatchedTimestamp = await createRelease(layout.releasesDirectory, revisions.candidate, {
      directoryName: `${revisions.candidate}-2026-09-12T12-00-01.000Z`,
    });
    await expect(runReleasePreflight({
      ...productionInput(layout),
      releaseDir: mismatchedTimestamp,
    })).rejects.toThrow(/timestamp/);
  });

  it("requires shared production.env outside releases and rejects embedded copies", async () => {
    const missing = await createLayout();
    await rm(missing.productionEnvPath);
    await expect(runReleasePreflight(productionInput(missing))).rejects.toThrow(/production\.env/);

    const embedded = await createLayout();
    await makeTreeWritable(embedded.candidateDirectory);
    await writeFile(join(embedded.candidateDirectory, "production.env"), "DATABASE_URL=not-used\n");
    await expect(runReleasePreflight(productionInput(embedded))).rejects.toThrow(/must not contain production\.env/);

    const inside = await createLayout();
    await expect(runReleasePreflight({
      ...productionInput(inside),
      productionEnvPath: join(inside.candidateDirectory, "production.env"),
    })).rejects.toThrow(/outside releases/);
  });

  it("fails closed on writable release content without changing its permissions", async () => {
    const layout = await createLayout();
    await makeTreeWritable(layout.candidateDirectory);
    const writableMode = (await lstat(layout.candidateDirectory)).mode;

    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/read-only immutable/);
    expect((await lstat(layout.candidateDirectory)).mode).toBe(writableMode);

    const source = await readFile(join(process.cwd(), "scripts", "production-release-preflight.mjs"), "utf8");
    expect(source).not.toMatch(/chmod\s*\(/);
  });

  it("fails closed when production identity or provider-disabled mode is unsafe", async () => {
    const layout = await createLayout();
    await expect(runReleasePreflight({ ...productionInput(layout), socialollaEnvironment: "staging" })).rejects.toThrow(/SOCIALOLLA_ENV/);
    await expect(runReleasePreflight({ ...productionInput(layout), socialollaEnvironment: "Production" })).rejects.toThrow(/SOCIALOLLA_ENV/);
    await expect(runReleasePreflight({ ...productionInput(layout), nodeEnvironment: "production " })).rejects.toThrow(/NODE_ENV/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: "false" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: undefined })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: "1" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: "TRUE" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: " true" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runReleasePreflight({ ...productionInput(layout), providerDisabled: "true " })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
  });

  it("rejects raw parent traversal in the configured releases directory", async () => {
    const layout = await createLayout();
    const traversedReleasesDirectory = `${layout.root}${sep}..${sep}${basename(layout.root)}${sep}releases`;
    await expect(runReleasePreflight({
      ...productionInput(layout),
      releasesDir: traversedReleasesDirectory,
    })).rejects.toThrow(/parent traversal/);
  });

  it("rejects a candidate without a full release manifest or with mismatched identity", async () => {
    const layout = await createLayout();
    await makeTreeWritable(layout.candidateDirectory);
    await rm(join(layout.candidateDirectory, "release-manifest.json"));
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/release-manifest/);

    const manifestPath = join(layout.candidateDirectory, "release-manifest.json");
    await writeFile(manifestPath, JSON.stringify({
      revision: revisions.current,
      environment: "production",
      buildTimestamp: "2026-09-12T12:00:00.000Z",
    }));
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/does not match/);

    await writeFile(manifestPath, JSON.stringify({
      revision: revisions.candidate,
      environment: " production ",
      buildTimestamp: "2026-09-12T12:00:00.000Z",
    }));
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/exactly production/);
  });

  it("rejects empty build and dependency markers instead of reporting ready", async () => {
    const emptyBuild = await createLayout();
    await makeTreeWritable(emptyBuild.candidateDirectory);
    await writeFile(join(emptyBuild.candidateDirectory, ".next", "BUILD_ID"), "\n");
    await expect(runReleasePreflight(productionInput(emptyBuild))).rejects.toThrow(/BUILD_ID.*empty/);

    const emptyDependencies = await createLayout();
    await makeTreeWritable(emptyDependencies.candidateDirectory);
    await rm(join(emptyDependencies.candidateDirectory, "node_modules"), { recursive: true, force: true });
    await mkdir(join(emptyDependencies.candidateDirectory, "node_modules"));
    await expect(runReleasePreflight(productionInput(emptyDependencies))).rejects.toThrow(/dependency/);
  });

  it("requires a strict canonical UTC build timestamp", async () => {
    const layout = await createLayout();
    await expect(runReleasePreflight({ ...productionInput(layout), buildTimestamp: "2026-09-12" })).rejects.toThrow(/strict ISO-8601/);
    await makeTreeWritable(layout.candidateDirectory);
    await writeFile(join(layout.candidateDirectory, "release-manifest.json"), JSON.stringify({
      revision: revisions.candidate,
      environment: "production",
      buildTimestamp: "2026-02-30T12:00:00.000Z",
    }));
    await expect(runReleasePreflight({ ...productionInput(layout), buildTimestamp: "2026-02-30T12:00:00.000Z" })).rejects.toThrow(/calendar/);
  });

  it("rejects duplicate current/previous targets and target escapes", async () => {
    const layout = await createLayout();
    await rm(layout.previousLink);
    await symlink(layout.currentDirectory, layout.previousLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/distinct/);

    await rm(layout.previousLink);
    const outside = await createRelease(layout.root, "4444444444444444444444444444444444444444");
    await symlink(outside, layout.previousLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/releases directory/);
  });

  it("rejects dependency path traversal and nested dependency symlinks", async () => {
    const traversal = await createLayout();
    await makeTreeWritable(traversal.candidateDirectory);
    const packagePath = join(traversal.candidateDirectory, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    packageJson.dependencies = { "../outside": "1.0.0" };
    await writeFile(packagePath, JSON.stringify(packageJson));
    await expect(runReleasePreflight(productionInput(traversal))).rejects.toThrow(/invalid npm package name/);

    const symlinkedDependency = await createLayout();
    await makeTreeWritable(symlinkedDependency.candidateDirectory);
    const outsideDependency = join(symlinkedDependency.root, "outside-next");
    await mkdir(outsideDependency);
    await writeFile(join(outsideDependency, "package.json"), JSON.stringify({ name: "next", version: "16.3.3" }));
    const nextPath = join(symlinkedDependency.candidateDirectory, "node_modules", "next");
    await rm(nextPath, { recursive: true, force: true });
    await symlink(outsideDependency, nextPath, "junction");
    await expect(runReleasePreflight(productionInput(symlinkedDependency))).rejects.toThrow(/cannot traverse a symlink/);
  });

  it("rejects release-root, candidate, and link-target aliases", async () => {
    const layout = await createLayout();
    const releasesAlias = join(layout.root, "releases-alias");
    await symlink(layout.releasesDirectory, releasesAlias, "junction");
    await expect(runReleasePreflight({
      ...productionInput(layout),
      releasesDir: releasesAlias,
    })).rejects.toThrow(/non-symlink/);

    await expect(runReleasePreflight({
      ...productionInput(layout),
      releaseDir: join(releasesAlias, releaseDirectoryNames.candidate),
    })).rejects.toThrow(/non-symlink/);

    await rm(layout.currentLink);
    await symlink(join(releasesAlias, releaseDirectoryNames.current), layout.currentLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/non-symlink/);

    const rollbackLayout = await createLayout();
    const rollbackAlias = join(rollbackLayout.root, "releases-alias");
    await symlink(rollbackLayout.releasesDirectory, rollbackAlias, "junction");
    await rm(rollbackLayout.currentLink);
    await symlink(join(rollbackAlias, releaseDirectoryNames.current), rollbackLayout.currentLink, "junction");
    await expect(runRollbackVerification({
      releasesDir: rollbackLayout.releasesDirectory,
      currentLink: rollbackLayout.currentLink,
      previousLink: rollbackLayout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/non-symlink/);
  });

  it("rejects symlink components above releases for candidate and link targets", async () => {
    const layout = await createLayout();
    const rootAlias = join(layout.root, "root-alias");
    await symlink(layout.root, rootAlias, "junction");
    await expect(runReleasePreflight({
      ...productionInput(layout),
      releaseDir: join(rootAlias, "releases", releaseDirectoryNames.candidate),
    })).rejects.toThrow(/non-symlink/);

    await rm(layout.currentLink);
    await symlink(join(rootAlias, "releases", releaseDirectoryNames.current), layout.currentLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/non-symlink/);

    const rollbackLayout = await createLayout();
    const rollbackRootAlias = join(rollbackLayout.root, "root-alias");
    await symlink(rollbackLayout.root, rollbackRootAlias, "junction");
    await rm(rollbackLayout.previousLink);
    await symlink(join(rollbackRootAlias, "releases", releaseDirectoryNames.previous), rollbackLayout.previousLink, "junction");
    await expect(runRollbackVerification({
      releasesDir: rollbackLayout.releasesDirectory,
      currentLink: rollbackLayout.currentLink,
      previousLink: rollbackLayout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/non-symlink/);
  });

  it("rejects symlinked parents for both configured release links", async () => {
    for (const linkName of ["currentLink", "previousLink"] as const) {
      const layout = await createLayout();
      const realLinkDirectory = join(layout.root, `${linkName}-target`);
      const aliasedLinkDirectory = join(layout.root, `${linkName}-alias`);
      await mkdir(realLinkDirectory);
      await symlink(realLinkDirectory, aliasedLinkDirectory, "junction");
      const realLink = join(realLinkDirectory, linkName);
      await symlink(linkName === "currentLink" ? layout.currentDirectory : layout.previousDirectory, realLink, "junction");
      await expect(runReleasePreflight({
        ...productionInput(layout),
        [linkName]: join(aliasedLinkDirectory, linkName),
      })).rejects.toThrow(/parent path/);
    }

    for (const linkName of ["currentLink", "previousLink"] as const) {
      const layout = await createLayout();
      const realLinkDirectory = join(layout.root, `${linkName}-rollback-target`);
      const aliasedLinkDirectory = join(layout.root, `${linkName}-rollback-alias`);
      await mkdir(realLinkDirectory);
      await symlink(realLinkDirectory, aliasedLinkDirectory, "junction");
      const realLink = join(realLinkDirectory, linkName);
      await symlink(linkName === "currentLink" ? layout.currentDirectory : layout.previousDirectory, realLink, "junction");
      await expect(runRollbackVerification({
        releasesDir: layout.releasesDirectory,
        currentLink: linkName === "currentLink" ? join(aliasedLinkDirectory, linkName) : layout.currentLink,
        previousLink: linkName === "previousLink" ? join(aliasedLinkDirectory, linkName) : layout.previousLink,
        socialollaEnvironment: "production",
        nodeEnvironment: "production",
        providerDisabled: "true",
        expectedCurrentRevision: revisions.current,
        expectedPreviousRevision: revisions.previous,
        trustedProductionOrigin: "https://production.example.com",
        applicationOrigin: "https://production.example.com",
        fetchImpl: vi.fn(),
      })).rejects.toThrow(/parent path/);
    }
  });

  it("rejects raw parent traversal before path normalization in both modes", async () => {
    const layout = await createLayout();
    const traversedCandidate = `${layout.releasesDirectory}${sep}..${sep}${basename(layout.releasesDirectory)}${sep}${revisions.candidate}`;
    await expect(runReleasePreflight({
      ...productionInput(layout),
      releaseDir: traversedCandidate,
    })).rejects.toThrow(/parent traversal/);

    const traversedCurrentLink = `${layout.root}${sep}..${sep}${basename(layout.root)}${sep}current`;
    await expect(runReleasePreflight({
      ...productionInput(layout),
      currentLink: traversedCurrentLink,
    })).rejects.toThrow(/parent traversal/);

    const traversedTarget = `${basename(layout.releasesDirectory)}${sep}..${sep}${basename(layout.releasesDirectory)}${sep}${releaseDirectoryNames.current}`;
    if (process.platform !== "win32") {
      await rm(layout.currentLink);
      await symlink(traversedTarget, layout.currentLink, "dir");
      await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/parent traversal/);
    }

    const rollbackLayout = await createLayout();
    const traversedPreviousLink = `${rollbackLayout.root}${sep}..${sep}${basename(rollbackLayout.root)}${sep}previous`;
    await expect(runRollbackVerification({
      releasesDir: rollbackLayout.releasesDirectory,
      currentLink: rollbackLayout.currentLink,
      previousLink: traversedPreviousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl: vi.fn(),
    })).rejects.toThrow(/parent traversal/);

    if (process.platform !== "win32") {
      await rm(rollbackLayout.currentLink);
      await symlink(traversedTarget, rollbackLayout.currentLink, "dir");
      await expect(runRollbackVerification({
        releasesDir: rollbackLayout.releasesDirectory,
        currentLink: rollbackLayout.currentLink,
        previousLink: rollbackLayout.previousLink,
        socialollaEnvironment: "production",
        nodeEnvironment: "production",
        providerDisabled: "true",
        expectedCurrentRevision: revisions.current,
        expectedPreviousRevision: revisions.previous,
        trustedProductionOrigin: "https://production.example.com",
        applicationOrigin: "https://production.example.com",
        fetchImpl: vi.fn(),
      })).rejects.toThrow(/parent traversal/);
    }
  });
});

describe("production rollback verification", () => {
  it("verifies the exact post-rollback pair and health revision without mutation", async () => {
    const layout = await createLayout();
    const beforeCurrent = await realpath(layout.currentLink);
    const beforePrevious = await realpath(layout.previousLink);
    const fetchImpl = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe("https://production.example.com/api/health");
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(options.cache).toBe("no-store");
      expect(options.body).toBeUndefined();
      return healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
        buildTimestamp: "2026-09-12T12:00:00.000Z",
      });
    });

    await expect(runRollbackVerification({
      releasesDir: layout.releasesDirectory,
      currentLink: layout.currentLink,
      previousLink: layout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl,
    })).resolves.toMatchObject({
      mode: "rollback-verification",
      ready: true,
      currentRevision: revisions.current,
      previousRevision: revisions.previous,
      healthRevision: revisions.current,
      symlinksUnchanged: true,
      databaseAction: "not-performed",
      providerAction: "not-performed",
    });

    expect(await realpath(layout.currentLink)).toBe(beforeCurrent);
    expect(await realpath(layout.previousLink)).toBe(beforePrevious);
  });

  it("fails closed when health or expected rollback identity is wrong", async () => {
    const layout = await createLayout();
    const fetchImpl = vi.fn(async () => healthResponse({
      ok: true,
      service: "socialolla",
      environment: "production",
      revision: revisions.previous,
    }));
    const input = {
      releasesDir: layout.releasesDirectory,
      currentLink: layout.currentLink,
      previousLink: layout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl,
    };
    await expect(runRollbackVerification(input)).rejects.toThrow(/Health revision/);
    await expect(runRollbackVerification({ ...input, expectedPreviousRevision: revisions.candidate })).rejects.toThrow(/exact revisions/);
    await expect(runRollbackVerification({ ...input, expectedCurrentRevision: revisions.candidate })).rejects.toThrow(/exact revisions/);
    await expect(runRollbackVerification({ ...input, socialollaEnvironment: "Production" })).rejects.toThrow(/SOCIALOLLA_ENV/);
    await expect(runRollbackVerification({ ...input, nodeEnvironment: "production " })).rejects.toThrow(/NODE_ENV/);
    await expect(runRollbackVerification({ ...input, providerDisabled: "false" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runRollbackVerification({ ...input, providerDisabled: undefined })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runRollbackVerification({ ...input, providerDisabled: "TRUE" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runRollbackVerification({ ...input, providerDisabled: " true" })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);
    await expect(runRollbackVerification({ ...input, providerDisabled: "true " })).rejects.toThrow(/SOCIALOLLA_PROVIDER_DISABLED/);

    const wrongEnvironment = {
      ...input,
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "Production",
        revision: revisions.current,
        buildTimestamp: "2026-09-12T12:00:00.000Z",
      })),
    };
    await expect(runRollbackVerification(wrongEnvironment)).rejects.toThrow(/healthy production/);

    const missingTimestamp = {
      ...input,
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
      })),
    };
    await expect(runRollbackVerification(missingTimestamp)).rejects.toThrow(/Health buildTimestamp/);

    const wrongTimestamp = {
      ...input,
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
        buildTimestamp: "2026-09-12T12:01:00.000Z",
      })),
    };
    await expect(runRollbackVerification(wrongTimestamp)).rejects.toThrow(/does not match the active release manifest/);
  });

  it("requires the configured trusted HTTPS health endpoint", async () => {
    const layout = await createLayout();
    const input = {
      releasesDir: layout.releasesDirectory,
      currentLink: layout.currentLink,
      previousLink: layout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
      })),
    };
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "http://production.example.com" })).rejects.toThrow(/HTTPS/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://production.example.com/health" })).rejects.toThrow(/origin without a path/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://user:password@production.example.com" })).rejects.toThrow(/credentials/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://production.example.com?check=1" })).rejects.toThrow(/query parameters/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://production.example.com#fragment" })).rejects.toThrow(/query parameters/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://production.example.com:8443" })).rejects.toThrow(/default HTTPS port/);
    await expect(runRollbackVerification({ ...input, applicationOrigin: "https://another-production.example.com" })).rejects.toThrow(/does not match/);
    await expect(runRollbackVerification({ ...input, trustedProductionOrigin: "https://127.0.0.1" })).rejects.toThrow(/public production hostname/);
    await expect(runRollbackVerification({
      ...input,
      fetchImpl: vi.fn(async () => ({
        ...healthResponse({
          ok: true,
          service: "socialolla",
          environment: "production",
          revision: revisions.current,
          buildTimestamp: "2026-09-12T12:00:00.000Z",
        }),
        redirected: true,
        url: "https://another-production.example.com/api/health",
      })),
    })).rejects.toThrow(/redirected/);

    const missingManifest = await createLayout();
    await makeTreeWritable(missingManifest.currentDirectory);
    await rm(join(missingManifest.currentDirectory, "release-manifest.json"));
    await expect(runRollbackVerification({
      ...input,
      releasesDir: missingManifest.releasesDirectory,
      currentLink: missingManifest.currentLink,
      previousLink: missingManifest.previousLink,
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
        buildTimestamp: "2026-09-12T12:00:00.000Z",
      })),
    })).rejects.toThrow(/release-manifest/);

    const missingPreviousManifest = await createLayout();
    await makeTreeWritable(missingPreviousManifest.previousDirectory);
    await rm(join(missingPreviousManifest.previousDirectory, "release-manifest.json"));
    await expect(runRollbackVerification({
      ...input,
      releasesDir: missingPreviousManifest.releasesDirectory,
      currentLink: missingPreviousManifest.currentLink,
      previousLink: missingPreviousManifest.previousLink,
      fetchImpl: vi.fn(async () => healthResponse({
        ok: true,
        service: "socialolla",
        environment: "production",
        revision: revisions.current,
        buildTimestamp: "2026-09-12T12:00:00.000Z",
      })),
    })).rejects.toThrow(/release-manifest/);
  });

  it("does not print secret-bearing health fields", async () => {
    const layout = await createLayout();
    const fetchImpl = vi.fn(async () => healthResponse({
      ok: true,
      service: "socialolla",
      environment: "production",
      revision: revisions.current,
      buildTimestamp: "2026-09-12T12:00:00.000Z",
      privateValue: "must-not-be-printed",
    }));
    await expect(runRollbackVerification({
      releasesDir: layout.releasesDirectory,
      currentLink: layout.currentLink,
      previousLink: layout.previousLink,
      socialollaEnvironment: "production",
      nodeEnvironment: "production",
      providerDisabled: "true",
      expectedCurrentRevision: revisions.current,
      expectedPreviousRevision: revisions.previous,
      trustedProductionOrigin: "https://production.example.com",
      applicationOrigin: "https://production.example.com",
      fetchImpl,
    })).resolves.toMatchObject({ ready: true });

    const source = await readFile(join(process.cwd(), "scripts", "production-release-preflight.mjs"), "utf8");
    expect(source).not.toContain("console.log(JSON.stringify(health");
    expect(source).not.toContain("privateValue");
    expect((await lstat(layout.currentLink)).isSymbolicLink()).toBe(true);
  });
});
