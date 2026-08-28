import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { connectionProviderFromSubject } from "@/lib/auth/auth-sync-diagnostics";

export const AUTH_SESSION_ESTABLISHED_EVENT = "AUTH_SESSION_ESTABLISHED";

export type AuthSessionAuditInput = {
  subject: string | null | undefined;
  emailVerified: boolean;
  sid?: string | null;
  authTime?: string | number | null;
};

type SessionReference = {
  value: string;
  source: "sid" | "auth_time" | "generated";
  deterministic: boolean;
};

export type AuthSessionAuditResult =
  | { status: "created" | "existing"; externalId: string }
  | { status: "skipped"; reason: "missing-subject" };

function runtimeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : null;
}

function digestSessionReference(subject: string, source: "sid" | "auth_time", value: string): string {
  return createHash("sha256")
    .update(`${subject}\u0000${source}\u0000${value}`)
    .digest("hex")
    .slice(0, 32);
}

export function deriveAuthSessionReference(input: AuthSessionAuditInput): SessionReference | null {
  const subject = input.subject?.trim();
  if (!subject) return null;

  const sid = input.sid?.trim();
  if (sid) {
    return {
      value: digestSessionReference(subject, "sid", sid),
      source: "sid",
      deterministic: true,
    };
  }

  const authTime = input.authTime === null || input.authTime === undefined
    ? ""
    : String(input.authTime).trim();
  if (authTime) {
    return {
      value: digestSessionReference(subject, "auth_time", authTime),
      source: "auth_time",
      deterministic: true,
    };
  }

  return {
    value: randomUUID().replaceAll("-", ""),
    source: "generated",
    deterministic: false,
  };
}

export function buildAuthSessionAuditEvent(
  input: AuthSessionAuditInput,
  env: NodeJS.ProcessEnv = process.env,
) {
  const subject = input.subject?.trim();
  const sessionRef = deriveAuthSessionReference(input);
  if (!subject || !sessionRef) return null;

  const connectionProvider = connectionProviderFromSubject(subject);
  const environment = runtimeLabel(env.SOCIALOLLA_ENV);
  const revision = runtimeLabel(
    env.SOCIALOLLA_REVISION ?? env.SOCIALOLLA_BUILD_REVISION ?? env.GIT_SHA,
  );

  return {
    externalId: `evt_auth_session_${sessionRef.value}`,
    actorAuthUserId: subject,
    eventType: AUTH_SESSION_ESTABLISHED_EVENT,
    payload: {
      provider: "Auth0",
      providerEmailVerified: input.emailVerified,
      sessionRef: sessionRef.value,
      sessionRefSource: sessionRef.source,
      ...(connectionProvider ? { connectionProvider } : {}),
      ...(environment ? { environment } : {}),
      ...(revision ? { revision } : {}),
    },
    deterministic: sessionRef.deterministic,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002",
  );
}

/**
 * Persist a privacy-minimized Auth0 session event for incident-response use.
 * Authentication does not depend on this write; callers must handle an audit
 * failure without rewriting or broadening the authorization decision.
 */
export async function recordAuthSessionEstablished(
  input: AuthSessionAuditInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AuthSessionAuditResult> {
  const event = buildAuthSessionAuditEvent(input, env);
  if (!event) return { status: "skipped", reason: "missing-subject" };

  try {
    await prisma.auditEvent.create({
      data: {
        externalId: event.externalId,
        actorAuthUserId: event.actorAuthUserId,
        eventType: event.eventType,
        payload: event.payload,
      },
    });
    return { status: "created", externalId: event.externalId };
  } catch (error) {
    // A repeated Auth0 callback for the same subject/session reference is the
    // same security event. Treat the deterministic unique-key collision as
    // idempotent. A generated reference should never collide in practice.
    if (event.deterministic && isUniqueConflict(error)) {
      return { status: "existing", externalId: event.externalId };
    }
    throw error;
  }
}
