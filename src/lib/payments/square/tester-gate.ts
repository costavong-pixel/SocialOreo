import { getVerifiedSessionUser, type VerifiedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { squareEnv } from "@/lib/payments/square/config";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getSquareSandboxTesterEmails(value = process.env.SQUARE_SANDBOX_TESTER_EMAILS): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export async function isSquareSandboxTester(authUser: VerifiedSessionUser): Promise<boolean> {
  const testerEmails = getSquareSandboxTesterEmails();
  if (!testerEmails.has(normalizeEmail(authUser.email))) return false;

  return requireAdminByAuthUserId(authUser.id);
}

// Monthly Sandbox checkout is deliberately closed unless both gates pass:
// a verified ADMIN user and an explicit server-only tester allowlist entry.
export async function requireSquareSandboxTester(): Promise<VerifiedSessionUser | null> {
  const authUser = await getVerifiedSessionUser();
  if (!authUser) return null;

  return await isSquareSandboxTester(authUser) ? authUser : null;
}

/**
 * Environment-aware checkout access gate (PROD-IMP-013). The environment source
 * is squareEnv() (fail closed on null) so it can never disagree with the API
 * host selected from config.environment:
 * - production: a verified session user is sufficient (no tester allowlist/admin);
 * - sandbox: the existing allowlist + admin gate applies byte-for-byte.
 */
export async function requireSquareCheckoutAccess(): Promise<VerifiedSessionUser | null> {
  if (squareEnv() === "production") return getVerifiedSessionUser();
  return requireSquareSandboxTester();
}
