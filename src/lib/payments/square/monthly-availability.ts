import type { SessionUser } from "@/lib/auth/current-user";
import { getSquareConfigDiagnostics, squareEnv } from "@/lib/payments/square/config";
import { getSquareSandboxTesterEmails } from "@/lib/payments/square/tester-gate";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";

export type MonthlyAvailabilityReason =
  | "NO_SESSION"
  | "EMAIL_MISSING"
  | "EMAIL_UNVERIFIED"
  | "TESTER_EMAIL_MISMATCH"
  | "NOT_ADMIN"
  | "SQUARE_CONFIG_INCOMPLETE"
  | "READY";

export type MonthlyAvailability = {
  available: boolean;
  reason: MonthlyAvailabilityReason;
  invalidOrMissingConfig?: string[];
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function evaluateServerMonthlyAvailability(
  user: SessionUser | null,
  isAdmin?: boolean,
): Promise<MonthlyAvailability> {
  if (!user) return { available: false, reason: "NO_SESSION" };
  if (!user.email) return { available: false, reason: "EMAIL_MISSING" };
  if (!user.emailVerified) return { available: false, reason: "EMAIL_UNVERIFIED" };

  if (squareEnv() === "production") {
    // Production: a verified user is sufficient (no tester allowlist/admin gate).
    // The Square configuration must still be complete or the flow stays
    // unavailable (fail closed). invalidOrMissingConfig is server-internal only
    // and never returned to the client by the availability route.
    const config = getSquareConfigDiagnostics();
    if (!config.valid) {
      return { available: false, reason: "SQUARE_CONFIG_INCOMPLETE", invalidOrMissingConfig: config.invalidOrMissing };
    }
    return { available: true, reason: "READY" };
  }

  // Sandbox: unchanged allowlist + admin gate (byte-for-byte).
  if (!getSquareSandboxTesterEmails().has(normalizeEmail(user.email))) {
    return { available: false, reason: "TESTER_EMAIL_MISMATCH" };
  }
  const admin = isAdmin ?? await requireAdminByAuthUserId(user.id);
  if (!admin) return { available: false, reason: "NOT_ADMIN" };
  const config = getSquareConfigDiagnostics();
  if (!config.valid) return { available: false, reason: "SQUARE_CONFIG_INCOMPLETE", invalidOrMissingConfig: config.invalidOrMissing };
  return { available: true, reason: "READY" };
}

// Presentation state only. The checkout route repeats every authorization and
// configuration check before creating a hosted payment link.
export async function getServerMonthlyAvailability(user: SessionUser | null, isAdmin: boolean): Promise<boolean> {
  return (await evaluateServerMonthlyAvailability(user, isAdmin)).available;
}
