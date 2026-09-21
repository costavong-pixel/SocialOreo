#!/usr/bin/env node

import { lstat, readFile, readdir, readlink, realpath } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_HEX = /^[0-9a-f]{40}$/i;
const PRODUCTION = "production";
const APPLICATION_NAME = "socialoreo";
const HEALTH_SERVICE_NAME = "socialolla";
const MANIFEST_NAME = "release-manifest.json";
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;
const NPM_PACKAGE_NAME = /^(?:[a-z0-9][a-z0-9._~-]*|@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*)$/;
const RELEASE_PREFLIGHT_MODE = "release-preflight";
const FIRST_DEPLOY_MODE = "first-deploy";
const DEFAULT_PRODUCTION_ENV_PATH = "/srv/socialolla/shared/production.env";
const WORKER_RUNTIME = Object.freeze({ packageName: "tsx", binaryName: "tsx" });

function normalize(value) {
  return String(value ?? "").trim();
}

function normalizeLower(value) {
  return normalize(value).toLowerCase();
}

function required(value, name) {
  const normalized = normalize(value);
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function exactString(value, name) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function assertNoParentTraversal(value, name) {
  const normalized = exactString(value, name);
  if (normalized.split(/[\\/]+/).some((segment) => segment === "..")) {
    throw new Error(`${name} must not contain parent traversal components.`);
  }
  return normalized;
}

function requireAbsolute(value, name) {
  const normalized = assertNoParentTraversal(value, name);
  if (!isAbsolute(normalized)) throw new Error(`${name} must be an absolute path.`);
  return resolve(normalized);
}

function assertRevision(value, name = "release revision") {
  const rawRevision = exactString(value, name);
  const revision = rawRevision.toLowerCase();
  if (!SHA256_HEX.test(rawRevision)) {
    throw new Error(`${name} must be a full 40-character hexadecimal Git SHA.`);
  }
  return revision;
}

function assertReleaseDirectoryTimestamp(value, name) {
  const rawTimestamp = exactString(value, name);
  const pathSafeMatch = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})(\.\d{3}Z)$/.exec(rawTimestamp);
  const isoMatch = /^(\d{4}-\d{2}-\d{2}T\d{2}):(\d{2}):(\d{2})(\.\d{3}Z)$/.exec(rawTimestamp);
  const compactMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\.\d{3})?Z$/.exec(rawTimestamp);
  let buildTimestamp;

  if (pathSafeMatch) {
    buildTimestamp = `${pathSafeMatch[1]}:${pathSafeMatch[2]}:${pathSafeMatch[3]}${pathSafeMatch[4]}`;
  } else if (isoMatch) {
    buildTimestamp = `${isoMatch[1]}:${isoMatch[2]}:${isoMatch[3]}${isoMatch[4]}`;
  } else if (compactMatch) {
    buildTimestamp = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T${compactMatch[4]}:${compactMatch[5]}:${compactMatch[6]}${compactMatch[7] ?? ".000"}Z`;
  } else {
    throw new Error(`${name} must be a UTC timestamp suffix (YYYY-MM-DDTHH-mm-ss.sssZ).`);
  }

  return {
    token: rawTimestamp,
    buildTimestamp: assertBuildTimestamp(buildTimestamp, name),
  };
}

function parseReleaseDirectoryName(value, name) {
  const releaseName = exactString(value, name);
  const match = /^([0-9a-f]{40})(?:-(.+))?$/i.exec(releaseName);
  if (!match) {
    throw new Error(`${name} must contain an exact 40-character hexadecimal Git SHA with an optional UTC timestamp suffix.`);
  }

  const revision = assertRevision(match[1], `${name} SHA`);
  const timestamp = match[2] ? assertReleaseDirectoryTimestamp(match[2], `${name} timestamp`) : null;
  return {
    revision,
    directoryTimestamp: timestamp?.buildTimestamp ?? null,
  };
}

function assertProductionEnvironment({ socialollaEnvironment, nodeEnvironment }) {
  if (socialollaEnvironment !== PRODUCTION) {
    throw new Error("SOCIALOLLA_ENV must be production for this preflight.");
  }
  if (nodeEnvironment !== PRODUCTION) {
    throw new Error("NODE_ENV must be production for this preflight.");
  }
}

function assertProviderDisabled(value) {
  if (value !== "true") throw new Error("SOCIALOLLA_PROVIDER_DISABLED must be true for this preflight.");
}

function assertDirectoryChild(target, root, label) {
  const relativeTarget = relative(root, target);
  const isDirectChild = relativeTarget && !relativeTarget.startsWith(`..${sep}`) && relativeTarget !== ".." && !isAbsolute(relativeTarget) && !relativeTarget.includes(sep);
  if (!isDirectChild) throw new Error(`${label} must be a direct child of the releases directory.`);
}

function assertReleasePath(target, releasesRoot, label) {
  assertDirectoryChild(target, releasesRoot, label);
  return parseReleaseDirectoryName(basename(target), `${label} name`);
}

async function assertLexicalReleasePath(target, releasesRoot, label) {
  const lexicalTarget = resolve(target);
  const identity = parseReleaseDirectoryName(basename(lexicalTarget), `${label} name`);
  const lexicalParent = dirname(lexicalTarget);
  await requireDirectory(lexicalParent, `${label} parent`, { rejectSymlink: true });
  const canonicalParent = await realpath(lexicalParent).catch(() => null);
  if (!canonicalParent || relative(releasesRoot, canonicalParent) !== "") {
    throw new Error(`${label} must be a direct child of the releases directory.`);
  }
  return identity;
}

async function requireDirectory(path, label, { rejectSymlink = false } = {}) {
  const metadata = await lstat(path).catch(() => null);
  if (!metadata || !metadata.isDirectory() || (rejectSymlink && metadata.isSymbolicLink())) {
    throw new Error(`${label} must be an existing${rejectSymlink ? " non-symlink" : ""} directory.`);
  }
}

async function assertNoSymlinkComponents(value, label, { allowFinalSymlink = false, allowMissingFinal = false } = {}) {
  const normalized = assertNoParentTraversal(value, label);
  if (!isAbsolute(normalized)) throw new Error(`${label} must be an absolute path.`);
  const root = parse(normalized).root;
  let current = root;
  const components = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean);
  for (const [index, component] of components.entries()) {
    current = current.endsWith("\\") || current.endsWith("/") ? `${current}${component}` : `${current}${sep}${component}`;
    const metadata = await lstat(current).catch(() => null);
    const isFinal = index === components.length - 1;
    if (!metadata && allowMissingFinal && isFinal) continue;
    if (!metadata || (!metadata.isDirectory() && !(allowFinalSymlink && isFinal && metadata.isSymbolicLink())) || (metadata.isSymbolicLink() && !(allowFinalSymlink && isFinal))) {
      const suffix = allowFinalSymlink ? " parent path" : " path";
      throw new Error(`${label}${suffix} must contain only existing non-symlink directories.`);
    }
  }
}

async function requireFile(path, label) {
  const metadata = await lstat(path).catch(() => null);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be an existing regular file.`);
}

async function assertReadOnlyReleaseTree(releaseDirectory, nodeModulesDirectory, label) {
  const pending = [releaseDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    const metadata = await lstat(current).catch(() => null);
    if (!metadata) throw new Error(`${label} could not be inspected for immutability.`);
    if (metadata.isSymbolicLink()) {
      await assertAllowedNpmBinSymlink(current, nodeModulesDirectory, label);
      continue;
    }
    if (!metadata.isDirectory() && !metadata.isFile()) throw new Error(`${label} contains an unsupported filesystem entry.`);
    if ((metadata.mode & 0o222) !== 0) {
      throw new Error(`${label} must satisfy the read-only immutable release contract.`);
    }
    if (basename(current).toLowerCase() === "production.env") {
      throw new Error(`${label} must not contain production.env; keep it outside releases.`);
    }
    if (metadata.isDirectory()) {
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        throw new Error(`${label} could not be read for immutability verification.`);
      }
      for (const entry of entries) pending.push(resolve(current, entry.name));
    }
  }
}

async function readJson(path, label) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(`${label} could not be read.`);
  }

  return parseJson(raw, label);
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function assertBuildTimestamp(value, label) {
  const timestamp = exactString(value, label);
  if (!UTC_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} must be a strict ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ).`);
  }
  const parsed = new Date(timestamp);
  if (parsed.toISOString() !== timestamp) {
    throw new Error(`${label} must be a valid calendar timestamp.`);
  }
  return timestamp;
}

async function readNonEmptyFile(path, label) {
  await requireFile(path, label);
  let value;
  try {
    value = (await readFile(path, "utf8")).trim();
  } catch {
    throw new Error(`${label} could not be read.`);
  }
  if (!value) throw new Error(`${label} must not be empty.`);
  return value;
}

function dependencyPathSegments(name, label) {
  if (!NPM_PACKAGE_NAME.test(name)) throw new Error(`${label} has an invalid npm package name.`);
  return name.startsWith("@") ? [...name.split("/"), "package.json"] : [name, "package.json"];
}

async function requireContainedRegularFile(root, segments, label) {
  let current = root;
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    const metadata = await lstat(current).catch(() => null);
    if (!metadata) throw new Error(`${label} is missing.`);
    if (metadata.isSymbolicLink()) throw new Error(`${label} cannot traverse a symlink.`);
    if (index === segments.length - 1) {
      if (!metadata.isFile()) throw new Error(`${label} must be a regular file.`);
    } else if (!metadata.isDirectory()) {
      throw new Error(`${label} contains a non-directory path component.`);
    }
  }
  const canonicalRoot = await realpath(root).catch(() => null);
  const canonical = await realpath(current).catch(() => null);
  const relativeCanonical = canonicalRoot && canonical ? relative(canonicalRoot, canonical) : null;
  if (!canonicalRoot || !canonical || !relativeCanonical || relativeCanonical.startsWith(`..${sep}`) || relativeCanonical === ".." || isAbsolute(relativeCanonical)) {
    throw new Error(`${label} resolves outside node_modules.`);
  }
  return current;
}

async function requireContainedExecutableFile(root, segments, label) {
  const file = await requireContainedRegularFile(root, segments, label);
  const metadata = await lstat(file).catch(() => null);
  if (!metadata || (process.platform !== "win32" && (metadata.mode & 0o111) === 0)) {
    throw new Error(`${label} must be executable.`);
  }
  return file;
}

function relativeContainedSegments(root, target, label) {
  const targetRelative = relative(root, target);
  if (!targetRelative || targetRelative === "." || targetRelative === ".." || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative)) {
    throw new Error(`${label} resolves outside node_modules.`);
  }
  return targetRelative.split(/[\\/]+/).filter(Boolean);
}

function packageBinEntrySegments(value, label) {
  const rawEntry = exactString(value, label);
  if (isAbsolute(rawEntry)) throw new Error(`${label} must be a relative package path.`);

  const segments = rawEntry.split(/[\\/]+/);
  const normalizedSegments = [];
  for (const segment of segments) {
    if (!segment || segment === "..") throw new Error(`${label} must not contain parent traversal.`);
    if (segment !== ".") normalizedSegments.push(segment);
  }
  if (normalizedSegments.length === 0) throw new Error(`${label} must identify a package file.`);
  return normalizedSegments;
}

function packageBinaryEntry(manifest, packageName, binaryName, label) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.name !== packageName) {
    throw new Error(`${label} package manifest identity is invalid.`);
  }

  let entry;
  if (typeof manifest.bin === "string") {
    const defaultBinaryName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
    if (binaryName !== defaultBinaryName) throw new Error(`${label} does not declare npm binary ${binaryName}.`);
    entry = manifest.bin;
  } else if (manifest.bin && typeof manifest.bin === "object" && !Array.isArray(manifest.bin) && typeof manifest.bin[binaryName] === "string") {
    entry = manifest.bin[binaryName];
  } else {
    throw new Error(`${label} does not declare npm binary ${binaryName}.`);
  }

  return packageBinEntrySegments(entry, `${label} npm binary ${binaryName}`);
}

function npmBinLinkTargetSegments(rawTarget, label) {
  if (typeof rawTarget !== "string" || rawTarget.length === 0 || isAbsolute(rawTarget)) {
    throw new Error(`${label} must use a relative npm binary target.`);
  }

  // npm creates links such as .bin/tsx -> ../tsx/dist/cli.mjs. Permit that
  // one step back to the owning node_modules directory, but no other traversal.
  const segments = rawTarget.split(/[\\/]+/);
  if (segments.length < 3 || segments[0] !== ".." || segments.slice(1).some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label} must use one contained npm binary parent path.`);
  }
  return segments.slice(1);
}

function packageFromNpmBinTarget(targetSegments, label) {
  const firstSegment = targetSegments[0];
  const packageSegments = firstSegment?.startsWith("@") ? targetSegments.slice(0, 2) : targetSegments.slice(0, 1);
  const packageName = packageSegments.join("/");
  const entrySegments = targetSegments.slice(packageSegments.length);
  if (!NPM_PACKAGE_NAME.test(packageName) || entrySegments.length === 0) {
    throw new Error(`${label} must target a package npm binary.`);
  }
  return { packageName, packageSegments, entrySegments };
}

async function assertAllowedNpmBinSymlink(linkPath, nodeModulesDirectory, label) {
  const binaryDirectory = dirname(linkPath);
  const owningNodeModulesDirectory = dirname(binaryDirectory);
  if (basename(binaryDirectory) !== ".bin" || basename(owningNodeModulesDirectory) !== "node_modules" || !isContainedPath(owningNodeModulesDirectory, nodeModulesDirectory)) {
    throw new Error(`${label} must not contain symlinks outside node_modules/.bin.`);
  }

  const rawTarget = await readlink(linkPath).catch(() => null);
  const binaryLabel = `${label} npm binary ${basename(linkPath)}`;
  const targetSegments = npmBinLinkTargetSegments(rawTarget, binaryLabel);
  const targetPath = resolve(owningNodeModulesDirectory, ...targetSegments);
  if (!isContainedPath(targetPath, nodeModulesDirectory)) {
    throw new Error(`${binaryLabel} must resolve inside node_modules.`);
  }

  const targetFile = await requireContainedRegularFile(
    nodeModulesDirectory,
    relativeContainedSegments(nodeModulesDirectory, targetPath, binaryLabel),
    binaryLabel,
  );
  const { packageName, packageSegments } = packageFromNpmBinTarget(targetSegments, binaryLabel);
  const packageDirectory = resolve(owningNodeModulesDirectory, ...packageSegments);
  if (!isContainedPath(packageDirectory, nodeModulesDirectory)) {
    throw new Error(`${binaryLabel} package must resolve inside node_modules.`);
  }

  const packageManifestPath = await requireContainedRegularFile(
    nodeModulesDirectory,
    relativeContainedSegments(nodeModulesDirectory, resolve(packageDirectory, "package.json"), binaryLabel),
    `${binaryLabel} package manifest`,
  );
  const packageManifest = await readJson(packageManifestPath, `${binaryLabel} package manifest`);
  const declaredEntrySegments = packageBinaryEntry(packageManifest, packageName, basename(linkPath), binaryLabel);
  const declaredEntryPath = await requireContainedRegularFile(
    nodeModulesDirectory,
    relativeContainedSegments(nodeModulesDirectory, resolve(packageDirectory, ...declaredEntrySegments), binaryLabel),
    `${binaryLabel} declared entry`,
  );
  const [canonicalTarget, canonicalDeclaredEntry] = await Promise.all([
    realpath(targetFile).catch(() => null),
    realpath(declaredEntryPath).catch(() => null),
  ]);
  if (!canonicalTarget || !canonicalDeclaredEntry || canonicalTarget !== canonicalDeclaredEntry) {
    throw new Error(`${binaryLabel} must resolve to its declared package entry.`);
  }

  return { packageName, binaryName: basename(linkPath), targetPath: targetFile };
}

async function assertWorkerRuntime(nodeModulesDirectory, label) {
  const runtimeLabel = `${label} worker runtime ${WORKER_RUNTIME.packageName}`;
  const runtimeManifestPath = await requireContainedRegularFile(
    nodeModulesDirectory,
    dependencyPathSegments(WORKER_RUNTIME.packageName, runtimeLabel),
    runtimeLabel,
  );
  const runtimeManifest = await readJson(runtimeManifestPath, runtimeLabel);
  const runtimeEntrySegments = packageBinaryEntry(
    runtimeManifest,
    WORKER_RUNTIME.packageName,
    WORKER_RUNTIME.binaryName,
    runtimeLabel,
  );
  const runtimeEntryPath = await requireContainedExecutableFile(
    nodeModulesDirectory,
    [WORKER_RUNTIME.packageName, ...runtimeEntrySegments],
    `${runtimeLabel} entry`,
  );
  const binaryPath = resolve(nodeModulesDirectory, ".bin", WORKER_RUNTIME.binaryName);
  const binaryMetadata = await lstat(binaryPath).catch(() => null);
  if (!binaryMetadata?.isSymbolicLink()) {
    throw new Error(`${runtimeLabel} npm binary must be a contained symbolic link.`);
  }
  const binary = await assertAllowedNpmBinSymlink(binaryPath, nodeModulesDirectory, label);
  const [canonicalRuntimeEntry, canonicalBinaryTarget] = await Promise.all([
    realpath(runtimeEntryPath).catch(() => null),
    realpath(binary.targetPath).catch(() => null),
  ]);
  if (binary.packageName !== WORKER_RUNTIME.packageName || binary.binaryName !== WORKER_RUNTIME.binaryName || !canonicalRuntimeEntry || canonicalRuntimeEntry !== canonicalBinaryTarget) {
    throw new Error(`${runtimeLabel} npm binary must resolve to its runtime entry.`);
  }
}

async function readReleaseManifest(releaseDirectory, { required: manifestRequired }) {
  const manifestPath = resolve(releaseDirectory, MANIFEST_NAME);
  const metadata = await lstat(manifestPath).catch(() => null);
  if (!metadata) {
    if (manifestRequired) throw new Error(`Release is missing ${MANIFEST_NAME}.`);
    return null;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${MANIFEST_NAME} must be a regular file.`);
  }

  const manifest = await readJson(manifestPath, MANIFEST_NAME);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${MANIFEST_NAME} must contain an object.`);
  }

  const environment = manifest.environment;
  if (environment !== PRODUCTION) {
    throw new Error(`${MANIFEST_NAME} environment must be exactly production.`);
  }

  return {
    revision: assertRevision(manifest.revision, `${MANIFEST_NAME} revision`),
    environment,
    buildTimestamp: assertBuildTimestamp(manifest.buildTimestamp, `${MANIFEST_NAME} buildTimestamp`),
  };
}

async function inspectReleaseDirectory(releaseDirectory, releasesRoot, label, { requireManifest }) {
  await assertNoSymlinkComponents(releaseDirectory, label);
  const lexicalDirectory = resolve(releaseDirectory);
  const lexicalRevision = await assertLexicalReleasePath(lexicalDirectory, releasesRoot, label);
  const canonicalDirectory = await realpath(lexicalDirectory).catch(() => null);
  if (!canonicalDirectory) throw new Error(`${label} could not be resolved.`);
  const canonicalIdentity = assertReleasePath(canonicalDirectory, releasesRoot, label);
  if (canonicalIdentity.revision !== lexicalRevision.revision || canonicalIdentity.directoryTimestamp !== lexicalRevision.directoryTimestamp) {
    throw new Error(`${label} path identity does not match its canonical release.`);
  }
  await requireDirectory(lexicalDirectory, label, { rejectSymlink: true });
  await requireFile(resolve(canonicalDirectory, "package.json"), `${label} package.json`);
  const packageJson = await readJson(resolve(canonicalDirectory, "package.json"), `${label} package.json`);
  if (packageJson?.name !== APPLICATION_NAME) {
    throw new Error(`${label} package.json must identify ${APPLICATION_NAME}.`);
  }
  const dependencies = packageJson.dependencies;
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies) || Object.keys(dependencies).length === 0) {
    throw new Error(`${label} package.json must declare production dependencies.`);
  }
  await requireDirectory(resolve(canonicalDirectory, ".next"), `${label} .next`, { rejectSymlink: true });
  const buildId = await readNonEmptyFile(resolve(canonicalDirectory, ".next", "BUILD_ID"), `${label} .next/BUILD_ID`);
  const nodeModulesDirectory = resolve(canonicalDirectory, "node_modules");
  await requireDirectory(nodeModulesDirectory, `${label} node_modules`, { rejectSymlink: true });
  for (const dependencyName of Object.keys(dependencies)) {
    const dependencyLabel = `${label} dependency ${dependencyName}`;
    const dependencyManifestPath = await requireContainedRegularFile(nodeModulesDirectory, dependencyPathSegments(dependencyName, dependencyLabel), dependencyLabel);
    const dependencyManifest = await readJson(dependencyManifestPath, `${label} dependency ${dependencyName}`);
    if (dependencyManifest?.name !== dependencyName) {
      throw new Error(`${label} dependency ${dependencyName} manifest identity is invalid.`);
    }
  }
  if (!Object.hasOwn(dependencies, WORKER_RUNTIME.packageName)) {
    throw new Error(`${label} package.json must declare ${WORKER_RUNTIME.packageName} as a production dependency.`);
  }
  await assertWorkerRuntime(nodeModulesDirectory, label);

  const manifest = await readReleaseManifest(canonicalDirectory, { required: requireManifest });
  if (manifest && manifest.revision !== canonicalIdentity.revision) {
    throw new Error(`${label} manifest revision does not match its directory name.`);
  }
  if (manifest && manifest.environment !== PRODUCTION) {
    throw new Error(`${label} manifest environment must be production.`);
  }
  if (manifest && canonicalIdentity.directoryTimestamp && manifest.buildTimestamp !== canonicalIdentity.directoryTimestamp) {
    throw new Error(`${label} directory timestamp does not match its release manifest timestamp.`);
  }

  const embeddedProductionEnv = resolve(canonicalDirectory, "production.env");
  if (await lstat(embeddedProductionEnv).catch(() => null)) {
    throw new Error(`${label} must not contain production.env; keep it outside releases.`);
  }
  await assertReadOnlyReleaseTree(canonicalDirectory, nodeModulesDirectory, label);

  return {
    revision: canonicalIdentity.revision,
    path: canonicalDirectory,
    buildId,
    manifest,
    directoryTimestamp: canonicalIdentity.directoryTimestamp,
  };
}

async function inspectReleaseLink(linkPath, releasesRoot, label, { requireManifest = false } = {}) {
  const metadata = await lstat(linkPath).catch(() => null);
  if (!metadata?.isSymbolicLink()) {
    throw new Error(`${label} must be a symbolic link.`);
  }

  const rawTarget = await readlink(linkPath).catch(() => null);
  if (!rawTarget) throw new Error(`${label} target could not be read.`);
  assertNoParentTraversal(rawTarget, `${label} target`);
  const rawTargetPath = isAbsolute(rawTarget) ? rawTarget : `${dirname(linkPath)}${sep}${rawTarget}`;
  await assertNoSymlinkComponents(rawTargetPath, `${label} target`);
  const lexicalTarget = resolve(dirname(linkPath), rawTarget);
  return inspectReleaseDirectory(lexicalTarget, releasesRoot, `${label} target`, { requireManifest });
}

async function inspectOptionalReleaseLink(linkPath, releasesRoot, label, { requireManifest = false } = {}) {
  let metadata;
  try {
    metadata = await lstat(linkPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`${label} could not be inspected.`);
  }
  if (!metadata) return null;
  return inspectReleaseLink(linkPath, releasesRoot, label, { requireManifest });
}

function isContainedPath(target, root) {
  const relativeTarget = relative(root, target);
  return relativeTarget === "" || (!relativeTarget.startsWith(`..${sep}`) && relativeTarget !== ".." && !isAbsolute(relativeTarget));
}

async function assertExternalProductionEnvironment(productionEnvPath, releasesRoot) {
  const configuredPath = requireAbsolute(productionEnvPath, "SOCIALOLLA_PRODUCTION_ENV");
  if (basename(configuredPath) !== "production.env") {
    throw new Error("SOCIALOLLA_PRODUCTION_ENV must end with production.env.");
  }

  const parent = dirname(configuredPath);
  await assertNoSymlinkComponents(parent, "SOCIALOLLA_PRODUCTION_ENV parent");
  const canonicalParent = await realpath(parent).catch(() => null);
  if (isContainedPath(configuredPath, releasesRoot) || (canonicalParent && isContainedPath(canonicalParent, releasesRoot))) {
    throw new Error("SOCIALOLLA_PRODUCTION_ENV must be outside releases.");
  }

  await requireFile(configuredPath, "SOCIALOLLA_PRODUCTION_ENV production.env");
  const canonicalPath = await realpath(configuredPath).catch(() => null);
  if (!canonicalPath || isContainedPath(canonicalPath, releasesRoot)) {
    throw new Error("SOCIALOLLA_PRODUCTION_ENV must resolve outside releases.");
  }
}

function configuredProductionEnvironmentPath(input, releasesRoot) {
  return input.productionEnvPath ?? resolve(dirname(releasesRoot), "shared", "production.env");
}

function configuredReleaseMode(value) {
  const mode = normalizeLower(value ?? RELEASE_PREFLIGHT_MODE).replaceAll("_", "-");
  if (mode === RELEASE_PREFLIGHT_MODE || mode === "preflight" || mode === "normal") return RELEASE_PREFLIGHT_MODE;
  if (mode === FIRST_DEPLOY_MODE || mode === "first") return FIRST_DEPLOY_MODE;
  throw new Error("Mode must be release-preflight, first-deploy, or rollback-verification.");
}

function buildLayout(input) {
  const releasesRoot = requireAbsolute(input.releasesDir, "SOCIALOLLA_RELEASES_DIR");
  const currentLink = requireAbsolute(input.currentLink, "SOCIALOLLA_CURRENT_LINK");
  const previousLink = requireAbsolute(input.previousLink, "SOCIALOLLA_PREVIOUS_LINK");
  if (releasesRoot === parse(releasesRoot).root) throw new Error("SOCIALOLLA_RELEASES_DIR cannot be the filesystem root.");
  if (currentLink === previousLink) throw new Error("Current and previous release links must be different paths.");
  return { releasesRoot, currentLink, previousLink };
}

function configuredRevision(input) {
  return assertRevision(input.revision ?? input.releaseRevision, "SOCIALOLLA_REVISION");
}

/**
 * Read-only candidate release validation. It intentionally does not create,
 * replace, remove, or chmod any path and never invokes the application engine.
 */
export async function runReleasePreflight(input) {
  const mode = configuredReleaseMode(input.mode);
  assertProductionEnvironment({
    socialollaEnvironment: input.socialollaEnvironment,
    nodeEnvironment: input.nodeEnvironment,
  });
  assertProviderDisabled(input.providerDisabled);

  const { releasesRoot, currentLink, previousLink } = buildLayout(input);
  await assertNoSymlinkComponents(input.releasesDir, "SOCIALOLLA_RELEASES_DIR");
  const allowMissingLinks = mode === FIRST_DEPLOY_MODE;
  await assertNoSymlinkComponents(input.currentLink, "SOCIALOLLA_CURRENT_LINK", { allowFinalSymlink: true, allowMissingFinal: allowMissingLinks });
  await assertNoSymlinkComponents(input.previousLink, "SOCIALOLLA_PREVIOUS_LINK", { allowFinalSymlink: true, allowMissingFinal: allowMissingLinks });
  await requireDirectory(releasesRoot, "SOCIALOLLA_RELEASES_DIR", { rejectSymlink: true });
  const canonicalRoot = await realpath(releasesRoot).catch(() => null);
  if (!canonicalRoot) throw new Error("SOCIALOLLA_RELEASES_DIR could not be resolved.");
  await requireDirectory(canonicalRoot, "SOCIALOLLA_RELEASES_DIR");
  await assertExternalProductionEnvironment(configuredProductionEnvironmentPath(input, releasesRoot), canonicalRoot);

  const candidatePath = requireAbsolute(input.releaseDir, "SOCIALOLLA_RELEASE_DIR");
  const candidate = await inspectReleaseDirectory(candidatePath, canonicalRoot, "Candidate release", { requireManifest: true });
  const expectedRevision = configuredRevision(input);
  if (candidate.revision !== expectedRevision) {
    throw new Error("SOCIALOLLA_REVISION does not match the candidate release directory.");
  }
  if (candidate.manifest.buildTimestamp !== assertBuildTimestamp(input.buildTimestamp, "SOCIALOLLA_BUILD_TIMESTAMP")) {
    throw new Error("SOCIALOLLA_BUILD_TIMESTAMP does not match the release manifest.");
  }

  if (mode === FIRST_DEPLOY_MODE) {
    const current = await inspectOptionalReleaseLink(currentLink, canonicalRoot, "SOCIALOLLA_CURRENT_LINK");
    const previous = await inspectOptionalReleaseLink(previousLink, canonicalRoot, "SOCIALOLLA_PREVIOUS_LINK");
    if (previous && !current) {
      throw new Error("FIRST_DEPLOY requires current when previous is present.");
    }
    if (current && previous) {
      throw new Error("FIRST_DEPLOY is only valid before rollback is available; use normal release preflight.");
    }
    if (current && candidate.revision === current.revision) {
      throw new Error("Candidate release must differ from the active current release.");
    }

    return {
      mode: FIRST_DEPLOY_MODE,
      deploymentMode: "FIRST_DEPLOY",
      ready: true,
      environment: PRODUCTION,
      providerDisabled: true,
      candidateRevision: candidate.revision,
      currentRevision: current?.revision ?? null,
      previousRevision: null,
      candidateBuildTimestamp: candidate.manifest.buildTimestamp,
      rollbackAvailable: false,
      releaseImmutable: true,
      symlinksUnchanged: true,
      databaseAction: "not-performed",
      providerAction: "not-performed",
    };
  }

  const current = await inspectReleaseLink(currentLink, canonicalRoot, "SOCIALOLLA_CURRENT_LINK");
  const previous = await inspectReleaseLink(previousLink, canonicalRoot, "SOCIALOLLA_PREVIOUS_LINK");
  if (current.revision === previous.revision) {
    throw new Error("Current and previous release links must target distinct releases.");
  }
  if (candidate.revision === current.revision) {
    throw new Error("Candidate release must differ from the active current release.");
  }

  return {
    mode: RELEASE_PREFLIGHT_MODE,
    deploymentMode: "NORMAL_DEPLOYMENT",
    ready: true,
    environment: PRODUCTION,
    providerDisabled: true,
    candidateRevision: candidate.revision,
    currentRevision: current.revision,
    previousRevision: previous.revision,
    candidateBuildTimestamp: candidate.manifest.buildTimestamp,
    rollbackAvailable: true,
    releaseImmutable: true,
    symlinksUnchanged: true,
    databaseAction: "not-performed",
    providerAction: "not-performed",
  };
}

function requireProductionOrigin(value, label) {
  const raw = exactString(value, label);
  if (raw.trim() !== raw) throw new Error(`${label} must not contain surrounding whitespace.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  if (!url.hostname || isIP(url.hostname) || url.hostname.toLowerCase() === "localhost") {
    throw new Error(`${label} must use a public production hostname.`);
  }
  if (url.port && url.port !== "443") throw new Error(`${label} must use the default HTTPS port.`);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query parameters, or fragments.`);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(`${label} must identify an origin without a path.`);
  }
  return url.origin;
}

async function fetchHealthPayload(trustedProductionOrigin, applicationOrigin, fetchImplementation = globalThis.fetch) {
  const trustedOrigin = requireProductionOrigin(trustedProductionOrigin, "SOCIALOLLA_PRODUCTION_ORIGIN");
  const configuredApplicationOrigin = requireProductionOrigin(applicationOrigin, "APP_BASE_URL");
  if (trustedOrigin !== configuredApplicationOrigin) {
    throw new Error("SOCIALOLLA_PRODUCTION_ORIGIN does not match APP_BASE_URL.");
  }
  const url = new URL("/api/health", trustedOrigin).toString();
  if (typeof fetchImplementation !== "function") throw new Error("A fetch implementation is required for health verification.");

  let response;
  try {
    response = await fetchImplementation(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error("The production health endpoint could not be reached.");
  }
  if (!response?.ok) throw new Error("The production health endpoint did not return success.");
  if (response.redirected === true || (response.url && response.url !== url)) {
    throw new Error("The production health endpoint redirected.");
  }
  const contentType = response.headers?.get?.("content-type");
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new Error("The production health endpoint did not return JSON.");
  }
  if (typeof response.text !== "function") throw new Error("The production health response could not be read.");
  let raw;
  try {
    raw = await response.text();
  } catch {
    throw new Error("The production health response could not be read.");
  }
  if (typeof raw !== "string" || raw.length > 65536) throw new Error("The production health response is invalid or too large.");
  const payload = parseJson(raw, "The production health response");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The production health response must contain a JSON object.");
  }
  return payload;
}

/**
 * Read-only post-switch/rollback verification. It validates the exact
 * current/previous pair and the safe /api/health identity without touching the
 * database, service manager, filesystem links, or any provider.
 */
export async function runRollbackVerification(input) {
  assertProductionEnvironment({
    socialollaEnvironment: input.socialollaEnvironment,
    nodeEnvironment: input.nodeEnvironment,
  });
  assertProviderDisabled(input.providerDisabled);

  const { releasesRoot, currentLink, previousLink } = buildLayout(input);
  await assertNoSymlinkComponents(input.releasesDir, "SOCIALOLLA_RELEASES_DIR");
  await assertNoSymlinkComponents(input.currentLink, "SOCIALOLLA_CURRENT_LINK", { allowFinalSymlink: true });
  await assertNoSymlinkComponents(input.previousLink, "SOCIALOLLA_PREVIOUS_LINK", { allowFinalSymlink: true });
  await requireDirectory(releasesRoot, "SOCIALOLLA_RELEASES_DIR", { rejectSymlink: true });
  const canonicalRoot = await realpath(releasesRoot).catch(() => null);
  if (!canonicalRoot) throw new Error("SOCIALOLLA_RELEASES_DIR could not be resolved.");
  await requireDirectory(canonicalRoot, "SOCIALOLLA_RELEASES_DIR");
  await assertExternalProductionEnvironment(configuredProductionEnvironmentPath(input, releasesRoot), canonicalRoot);

  const expectedCurrent = assertRevision(input.expectedCurrentRevision, "EXPECTED_CURRENT_REVISION");
  const expectedPrevious = assertRevision(input.expectedPreviousRevision, "EXPECTED_PREVIOUS_REVISION");
  if (expectedCurrent === expectedPrevious) throw new Error("Expected current and previous revisions must differ.");

  const current = await inspectReleaseLink(currentLink, canonicalRoot, "SOCIALOLLA_CURRENT_LINK", { requireManifest: true });
  const previous = await inspectReleaseLink(previousLink, canonicalRoot, "SOCIALOLLA_PREVIOUS_LINK", { requireManifest: true });
  if (current.revision !== expectedCurrent || previous.revision !== expectedPrevious) {
    throw new Error("Current/previous release links do not match the expected exact revisions.");
  }

  const health = await fetchHealthPayload(input.trustedProductionOrigin, input.applicationOrigin, input.fetchImpl);
  if (health.ok !== true || health.service !== HEALTH_SERVICE_NAME || health.environment !== PRODUCTION) {
    throw new Error("Health payload does not identify a healthy production SocialOlla service.");
  }
  const healthRevision = assertRevision(health.revision, "Health revision");
  if (healthRevision !== current.revision) {
    throw new Error("Health revision does not match the active current release.");
  }
  const healthBuildTimestamp = assertBuildTimestamp(health.buildTimestamp, "Health buildTimestamp");
  if (healthBuildTimestamp !== current.manifest.buildTimestamp) {
    throw new Error("Health buildTimestamp does not match the active release manifest.");
  }

  return {
    mode: "rollback-verification",
    ready: true,
    environment: PRODUCTION,
    providerDisabled: true,
    currentRevision: current.revision,
    previousRevision: previous.revision,
    rollbackAvailable: true,
    releaseImmutable: true,
    healthRevision,
    healthBuildTimestamp,
    symlinksUnchanged: true,
    databaseAction: "not-performed",
    providerAction: "not-performed",
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      options.mode = required(argv[++index], "--mode");
      continue;
    }
    if (argument.startsWith("--mode=")) {
      options.mode = required(argument.slice("--mode=".length), "--mode");
      continue;
    }
    if (argument.startsWith("--")) {
      const separator = argument.indexOf("=");
      const name = separator === -1 ? argument.slice(2) : argument.slice(2, separator);
      const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}.`);
      options[name] = value;
      continue;
    }
    throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

function inputFromEnvironment(options) {
  const mode = normalizeLower(options.mode ?? process.env.SOCIALOLLA_RELEASE_CHECK_MODE ?? RELEASE_PREFLIGHT_MODE).replaceAll("_", "-");
  const input = {
    releasesDir: options["releases-dir"] ?? process.env.SOCIALOLLA_RELEASES_DIR,
    currentLink: options["current-link"] ?? process.env.SOCIALOLLA_CURRENT_LINK,
    previousLink: options["previous-link"] ?? process.env.SOCIALOLLA_PREVIOUS_LINK,
    socialollaEnvironment: process.env.SOCIALOLLA_ENV,
    nodeEnvironment: process.env.NODE_ENV,
    providerDisabled: process.env.SOCIALOLLA_PROVIDER_DISABLED,
    productionEnvPath: DEFAULT_PRODUCTION_ENV_PATH,
  };

  if (mode === RELEASE_PREFLIGHT_MODE || mode === "preflight" || mode === "normal") {
    return {
      mode: RELEASE_PREFLIGHT_MODE,
      input: {
        ...input,
        mode: RELEASE_PREFLIGHT_MODE,
        releaseDir: options["release-dir"] ?? process.env.SOCIALOLLA_RELEASE_DIR,
        revision: options.revision ?? process.env.SOCIALOLLA_REVISION ?? process.env.RELEASE_GIT_SHA,
        buildTimestamp: options["build-timestamp"] ?? process.env.SOCIALOLLA_BUILD_TIMESTAMP ?? process.env.RELEASE_BUILD_TIMESTAMP,
      },
    };
  }
  if (mode === FIRST_DEPLOY_MODE || mode === "first") {
    return {
      mode: FIRST_DEPLOY_MODE,
      input: {
        ...input,
        mode: FIRST_DEPLOY_MODE,
        releaseDir: options["release-dir"] ?? process.env.SOCIALOLLA_RELEASE_DIR,
        revision: options.revision ?? process.env.SOCIALOLLA_REVISION ?? process.env.RELEASE_GIT_SHA,
        buildTimestamp: options["build-timestamp"] ?? process.env.SOCIALOLLA_BUILD_TIMESTAMP ?? process.env.RELEASE_BUILD_TIMESTAMP,
      },
    };
  }
  if (mode === "rollback" || mode === "rollback-verification") {
    return {
      mode: "rollback-verification",
      input: {
        ...input,
        mode: "rollback-verification",
        expectedCurrentRevision: options["expected-current"] ?? process.env.SOCIALOLLA_EXPECTED_CURRENT_REVISION,
        expectedPreviousRevision: options["expected-previous"] ?? process.env.SOCIALOLLA_EXPECTED_PREVIOUS_REVISION,
        trustedProductionOrigin: process.env.SOCIALOLLA_PRODUCTION_ORIGIN,
        applicationOrigin: process.env.APP_BASE_URL,
      },
    };
  }
  throw new Error("Mode must be release-preflight, first-deploy, or rollback-verification.");
}

async function main() {
  const configured = inputFromEnvironment(parseArguments(process.argv));
  const result = configured.mode === RELEASE_PREFLIGHT_MODE || configured.mode === FIRST_DEPLOY_MODE
    ? await runReleasePreflight(configured.input)
    : await runRollbackVerification(configured.input);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    const mode = process.argv.some((argument) => ["--mode=rollback", "--mode=rollback-verification"].includes(argument))
      ? "ROLLBACK_VERIFICATION"
      : process.argv.some((argument) => ["--mode=first-deploy", "--mode=first_deploy", "--mode=first"].includes(argument))
        ? "FIRST_DEPLOY"
      : "RELEASE_PREFLIGHT";
    console.error(`${mode}_FAILED=${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
