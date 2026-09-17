import { afterEach, describe, expect, it, vi } from "vitest";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { tmpdir } from "node:os";

// @ts-expect-error The operational release module is native ESM JavaScript executed directly by Node.
import { runReleasePreflight, runRollbackVerification } from "./production-release-preflight.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const revisions = {
  previous: "1111111111111111111111111111111111111111",
  current: "2222222222222222222222222222222222222222",
  candidate: "3333333333333333333333333333333333333333",
};

async function createRelease(releasesDirectory: string, revision: string, { manifest = true } = {}) {
  const releaseDirectory = join(releasesDirectory, revision);
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
      buildTimestamp: "2026-09-12T12:00:00.000Z",
    }));
  }
  return releaseDirectory;
}

async function createLayout() {
  const root = await mkdtemp(join(tmpdir(), "socialolla-release-preflight-test-"));
  temporaryDirectories.push(root);
  const releasesDirectory = join(root, "releases");
  await mkdir(releasesDirectory);
  const previousDirectory = await createRelease(releasesDirectory, revisions.previous);
  const currentDirectory = await createRelease(releasesDirectory, revisions.current);
  const candidateDirectory = await createRelease(releasesDirectory, revisions.candidate);
  const currentLink = join(root, "current");
  const previousLink = join(root, "previous");
  await symlink(previousDirectory, previousLink, "junction");
  await symlink(currentDirectory, currentLink, "junction");
  return { root, releasesDirectory, previousDirectory, currentDirectory, candidateDirectory, currentLink, previousLink };
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
    buildTimestamp: "2026-09-12T12:00:00.000Z",
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
    await writeFile(join(emptyBuild.candidateDirectory, ".next", "BUILD_ID"), "\n");
    await expect(runReleasePreflight(productionInput(emptyBuild))).rejects.toThrow(/BUILD_ID.*empty/);

    const emptyDependencies = await createLayout();
    await rm(join(emptyDependencies.candidateDirectory, "node_modules"), { recursive: true, force: true });
    await mkdir(join(emptyDependencies.candidateDirectory, "node_modules"));
    await expect(runReleasePreflight(productionInput(emptyDependencies))).rejects.toThrow(/dependency/);
  });

  it("requires a strict canonical UTC build timestamp", async () => {
    const layout = await createLayout();
    await expect(runReleasePreflight({ ...productionInput(layout), buildTimestamp: "2026-09-12" })).rejects.toThrow(/strict ISO-8601/);
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
    const packagePath = join(traversal.candidateDirectory, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    packageJson.dependencies = { "../outside": "1.0.0" };
    await writeFile(packagePath, JSON.stringify(packageJson));
    await expect(runReleasePreflight(productionInput(traversal))).rejects.toThrow(/invalid npm package name/);

    const symlinkedDependency = await createLayout();
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
      releaseDir: join(releasesAlias, revisions.candidate),
    })).rejects.toThrow(/non-symlink/);

    await rm(layout.currentLink);
    await symlink(join(releasesAlias, revisions.current), layout.currentLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/non-symlink/);

    const rollbackLayout = await createLayout();
    const rollbackAlias = join(rollbackLayout.root, "releases-alias");
    await symlink(rollbackLayout.releasesDirectory, rollbackAlias, "junction");
    await rm(rollbackLayout.currentLink);
    await symlink(join(rollbackAlias, revisions.current), rollbackLayout.currentLink, "junction");
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
      releaseDir: join(rootAlias, "releases", revisions.candidate),
    })).rejects.toThrow(/non-symlink/);

    await rm(layout.currentLink);
    await symlink(join(rootAlias, "releases", revisions.current), layout.currentLink, "junction");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/non-symlink/);

    const rollbackLayout = await createLayout();
    const rollbackRootAlias = join(rollbackLayout.root, "root-alias");
    await symlink(rollbackLayout.root, rollbackRootAlias, "junction");
    await rm(rollbackLayout.previousLink);
    await symlink(join(rollbackRootAlias, "releases", revisions.previous), rollbackLayout.previousLink, "junction");
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

    await rm(layout.currentLink);
    const traversedTarget = `${basename(layout.releasesDirectory)}${sep}..${sep}${basename(layout.releasesDirectory)}${sep}${revisions.current}`;
    await symlink(traversedTarget, layout.currentLink, "dir");
    await expect(runReleasePreflight(productionInput(layout))).rejects.toThrow(/parent traversal/);

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
