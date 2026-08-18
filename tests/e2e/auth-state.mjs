import fs from "node:fs";
import path from "node:path";

export const STAGING_ORIGIN = "https://staging.socialolla.com";
export const STAGING_AUTH0_HOST = "dev-b12p7c5vfprk0hi8.us.auth0.com";
const STAGING_AUTH0_ORIGIN = `https://${STAGING_AUTH0_HOST}`;
const LEGACY_SESSION_COOKIE_PROVENANCE = "staging-auth0";
const PRIVATE_FILE_MODE = 0o600;

const PRODUCTION_OR_UNPINNED_HOSTS = new Set([
  "socialolla.com",
  "www.socialolla.com",
  "square.link",
  "www.square.link",
  "squareup.com",
  "www.squareup.com",
  "connect.squareup.com",
  "checkout.square.site",
  "checkout.squareup.com",
  "pay.squareup.com",
]);

function envValue(env, name) {
  return typeof env[name] === "string" ? env[name].trim() : "";
}

function isInsideRepository(candidate, repository) {
  const relative = path.relative(path.resolve(repository), path.resolve(candidate));
  return relative === ""
    || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function assertExternalAuthArtifactPath(rawPath, {
  label,
  repoRoot = process.cwd(),
} = {}) {
  const candidate = path.resolve(rawPath);
  if (isInsideRepository(candidate, repoRoot)) {
    throw new Error(`${label} must remain outside the repository; refusing an in-repository auth artifact.`);
  }
  return candidate;
}

function assertPrivateFile(filePath, label) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new Error(`${label} does not exist at the configured external path.`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }

  // Windows does not expose POSIX permission bits reliably. The headed
  // creation command still applies 0600 there; the mode is enforced on the
  // Linux staging/CI runners where these artifacts are consumed.
  if (process.platform !== "win32" && (stat.mode & 0o777) !== PRIVATE_FILE_MODE) {
    throw new Error(`${label} must have mode 0600.`);
  }
}

function parseOrigin(rawOrigin, label) {
  let url;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin without credentials, path, query, or fragment.`);
  }
  return url.origin;
}

function assertAllowedOrigin(rawOrigin, label) {
  const origin = parseOrigin(rawOrigin, label);
  if (origin !== STAGING_ORIGIN && origin !== STAGING_AUTH0_ORIGIN) {
    throw new Error(`${label} is not an approved staging origin.`);
  }
  return origin;
}

function assertAllowedCookieHost(rawHost, label) {
  const host = rawHost.replace(/^\./, "").toLowerCase();
  if (host === "socialolla.com" || host.endsWith(".socialolla.com")) {
    if (host !== new URL(STAGING_ORIGIN).hostname) {
      throw new Error(`${label} points to a production or unapproved SocialOlla host.`);
    }
    return host;
  }
  if (PRODUCTION_OR_UNPINNED_HOSTS.has(host)) {
    throw new Error(`${label} points to a production or unapproved provider host.`);
  }
  if (host !== new URL(STAGING_ORIGIN).hostname && host !== STAGING_AUTH0_HOST) {
    throw new Error(`${label} points outside the approved staging authentication hosts.`);
  }
  return host;
}

export function validateStorageStateData(data, source = "PLAYWRIGHT_STORAGE_STATE") {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${source} must contain a Playwright storageState object.`);
  }
  if (!Array.isArray(data.cookies) || !Array.isArray(data.origins)) {
    throw new Error(`${source} must contain cookies and origins arrays.`);
  }

  for (const [index, originEntry] of data.origins.entries()) {
    if (!originEntry || typeof originEntry.origin !== "string") {
      throw new Error(`${source}.origins[${index}] is missing its origin.`);
    }
    assertAllowedOrigin(originEntry.origin, `${source}.origins[${index}].origin`);
  }

  let hasStagingCookie = false;
  for (const [index, cookie] of data.cookies.entries()) {
    if (!cookie || typeof cookie !== "object") {
      throw new Error(`${source}.cookies[${index}] is invalid.`);
    }

    if (typeof cookie.url === "string") {
      const origin = assertAllowedOrigin(cookie.url, `${source}.cookies[${index}].url`);
      if (origin === STAGING_ORIGIN) hasStagingCookie = true;
    } else if (typeof cookie.domain === "string" && cookie.domain.trim()) {
      const host = assertAllowedCookieHost(cookie.domain, `${source}.cookies[${index}].domain`);
      if (host === new URL(STAGING_ORIGIN).hostname) hasStagingCookie = true;
    } else {
      throw new Error(`${source}.cookies[${index}] must identify its staging or staging-Auth0 host.`);
    }
  }

  if (!hasStagingCookie) {
    throw new Error(`${source} must contain an authenticated cookie for ${STAGING_ORIGIN}.`);
  }
  return data;
}

export function validateStorageStateFile(filePath, {
  repoRoot = process.cwd(),
  source = "PLAYWRIGHT_STORAGE_STATE",
} = {}) {
  const externalPath = assertExternalAuthArtifactPath(filePath, { label: source, repoRoot });
  assertPrivateFile(externalPath, source);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(externalPath, "utf8"));
  } catch {
    throw new Error(`${source} is not valid JSON.`);
  }
  validateStorageStateData(data, source);
  return externalPath;
}

function validateLegacySessionCookieFile(filePath, repoRoot) {
  const externalPath = assertExternalAuthArtifactPath(filePath, {
    label: "SESSION_COOKIE_FILE",
    repoRoot,
  });
  assertPrivateFile(externalPath, "SESSION_COOKIE_FILE");
  return externalPath;
}

export function resolveAuthState({ env = process.env, repoRoot = process.cwd() } = {}) {
  const storageStateFile = envValue(env, "PLAYWRIGHT_STORAGE_STATE");
  if (storageStateFile) {
    return {
      kind: "storageState",
      path: validateStorageStateFile(storageStateFile, { repoRoot }),
    };
  }

  const sessionCookieFile = envValue(env, "SESSION_COOKIE_FILE");
  if (sessionCookieFile) {
    if (envValue(env, "SESSION_COOKIE_PROVENANCE") !== LEGACY_SESSION_COOKIE_PROVENANCE) {
      throw new Error("Set SESSION_COOKIE_PROVENANCE=staging-auth0 for the legacy staging cookie fallback.");
    }
    return {
      kind: "sessionCookie",
      path: validateLegacySessionCookieFile(sessionCookieFile, repoRoot),
    };
  }

  return null;
}

export function requireAuthState(options = {}) {
  const authState = resolveAuthState(options);
  if (!authState) {
    throw new Error(
      "PLAYWRIGHT_AUTH_HARNESS_GATE: no approved staging authentication state supplied. "
      + "Set PLAYWRIGHT_STORAGE_STATE to an external mode-0600 storageState file created by the headed staging Google login, "
      + "or use SESSION_COOKIE_FILE with SESSION_COOKIE_PROVENANCE=staging-auth0.",
    );
  }
  return authState;
}

export function readLegacySessionCookie(authState) {
  if (authState?.kind !== "sessionCookie") return "";
  const value = fs.readFileSync(authState.path, "utf8").trim();
  if (!value) {
    throw new Error("SESSION_COOKIE_FILE is empty; provide a freshly minted staging Auth0 cookie or PLAYWRIGHT_STORAGE_STATE.");
  }
  return value;
}

export async function addStagingSession(page, testInfo) {
  const authState = requireAuthState();
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string" || new URL(baseURL).origin !== STAGING_ORIGIN) {
    throw new Error(`Playwright BASE_URL must be exactly ${STAGING_ORIGIN}.`);
  }

  if (authState.kind === "sessionCookie") {
    await page.context().addCookies([{
      name: "__session",
      value: readLegacySessionCookie(authState),
      url: STAGING_ORIGIN,
    }]);
  }
}
