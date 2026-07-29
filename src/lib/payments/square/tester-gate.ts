import { getVerifiedSessionUser, type VerifiedSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";

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

// Monthly Sandbox checkout is deliberately closed unless both gates pass:
// a verified ADMIN user and an explicit server-only tester allowlist entry.
export async function requireSquareSandboxTester(): Promise<VerifiedSessionUser | null> {
  const authUser = await getVerifiedSessionUser();
  if (!authUser) return null;

  const testerEmails = getSquareSandboxTesterEmails();
  if (!testerEmails.has(normalizeEmail(authUser.email))) return null;

  return await requireAdminByAuthUserId(authUser.id) ? authUser : null;
}
