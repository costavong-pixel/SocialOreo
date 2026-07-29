import type { SessionUser } from "@/lib/auth/current-user";
import { getSquareConfigDiagnostics } from "@/lib/payments/square/config";
import { getSquareSandboxTesterEmails } from "@/lib/payments/square/tester-gate";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";

export type MonthlyAvailabilityReason =
  | "NO_SESSION"
  | "EMAIL_MISSING"
  | "EMAIL_UNVERIFIED"
  | "TESTER_EMAIL_MISMATCH"
  | "NOT_ADMIN"
  | "SQUARE_ENV_NOT_SANDBOX"
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
  if (!getSquareSandboxTesterEmails().has(normalizeEmail(user.email))) {
    return { available: false, reason: "TESTER_EMAIL_MISMATCH" };
  }
  const admin = isAdmin ?? await requireAdminByAuthUserId(user.id);
  if (!admin) return { available: false, reason: "NOT_ADMIN" };
  if (process.env.SQUARE_ENV !== "sandbox") return { available: false, reason: "SQUARE_ENV_NOT_SANDBOX" };
  const config = getSquareConfigDiagnostics();
  if (!config.valid) return { available: false, reason: "SQUARE_CONFIG_INCOMPLETE", invalidOrMissingConfig: config.invalidOrMissing };
  return { available: true, reason: "READY" };
}

// Presentation state only. The checkout route repeats every authorization and
// configuration check before creating a hosted Sandbox payment link.
export async function getServerMonthlyAvailability(user: SessionUser | null, isAdmin: boolean): Promise<boolean> {
  return (await evaluateServerMonthlyAvailability(user, isAdmin)).available;
}
