import { prisma } from "@/lib/db/prisma";
import { accountSupportReference } from "@/lib/auth/support-reference";
import { AUTH_SESSION_ESTABLISHED_EVENT } from "@/lib/auth/session-audit";

export type AuthSessionLogRow = {
  id: string;
  occurredAt: Date;
  accountEmail: string | null;
  accountRole: "USER" | "ADMIN" | null;
  accountReference: string;
  providerEmailVerified: boolean | null;
  connectionProvider: string | null;
  environment: string | null;
  revision: string | null;
  sessionRef: string | null;
  sessionRefSource: string | null;
};

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === "string" ? payload[key] as string : null;
}

function booleanField(payload: Record<string, unknown>, key: string): boolean | null {
  return typeof payload[key] === "boolean" ? payload[key] as boolean : null;
}

/**
 * Admin/playbook projection of persisted authentication-session evidence.
 *
 * The audit event deliberately does not duplicate a raw email or role. This
 * view resolves the current canonical User row by the persisted Auth0 subject
 * and exposes only the account email and current database role to the
 * server-authorized admin surface. The raw Auth0 subject is never returned to
 * the UI.
 *
 * `accountRole` is the CURRENT database role at read time. It must not be
 * interpreted as a historical role-at-login claim if an administrator later
 * changes the account role.
 */
export async function listAuthSessionLog(limit = 100): Promise<AuthSessionLogRow[]> {
  const take = Math.max(1, Math.min(Math.trunc(limit) || 100, 500));
  const events = await prisma.auditEvent.findMany({
    where: { eventType: AUTH_SESSION_ESTABLISHED_EVENT },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      externalId: true,
      actorAuthUserId: true,
      payload: true,
      occurredAt: true,
    },
  });

  const subjects = Array.from(new Set(events.map((event) => event.actorAuthUserId).filter((value): value is string => Boolean(value))));
  const users = subjects.length === 0
    ? []
    : await prisma.user.findMany({
        where: { authUserId: { in: subjects } },
        select: { id: true, authUserId: true, email: true, role: true },
      });
  const userBySubject = new Map(users.map((user) => [user.authUserId, user]));

  return events.map((event) => {
    const payload = objectPayload(event.payload);
    const user = event.actorAuthUserId ? userBySubject.get(event.actorAuthUserId) : undefined;

    return {
      id: event.id,
      occurredAt: event.occurredAt,
      accountEmail: user?.email ?? null,
      accountRole: user?.role ?? null,
      accountReference: accountSupportReference(user?.id ?? event.actorAuthUserId ?? event.externalId),
      providerEmailVerified: booleanField(payload, "providerEmailVerified"),
      connectionProvider: stringField(payload, "connectionProvider"),
      environment: stringField(payload, "environment"),
      revision: stringField(payload, "revision"),
      sessionRef: stringField(payload, "sessionRef"),
      sessionRefSource: stringField(payload, "sessionRefSource"),
    };
  });
}
