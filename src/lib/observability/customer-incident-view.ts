import { accountSupportReference } from "@/lib/auth/support-reference";
import { prisma } from "@/lib/db/prisma";
import { CUSTOMER_ERROR_EVENT } from "@/lib/observability/customer-incident";
import { normalizeCustomerIncidentRoute } from "@/lib/observability/customer-incident";

export type CustomerIncidentLogRow = {
  id: string;
  occurredAt: Date;
  incidentReference: string;
  accountCurrentRole: "USER" | "ADMIN" | null;
  roleAtIncident: "USER" | "ADMIN" | null;
  accountReference: string;
  route: string;
  environment: string | null;
  revision: string | null;
};

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  return typeof payload[key] === "string" ? payload[key] as string : null;
}

function roleField(payload: Record<string, unknown>, key: string): "USER" | "ADMIN" | null {
  const value = payload[key];
  return value === "USER" || value === "ADMIN" ? value : null;
}

export async function listCustomerIncidentLog(limit = 100): Promise<CustomerIncidentLogRow[]> {
  const take = Math.max(1, Math.min(Math.trunc(limit) || 100, 500));
  const events = await prisma.auditEvent.findMany({
    where: { eventType: CUSTOMER_ERROR_EVENT },
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

  const subjects = Array.from(new Set(
    events.map((event) => event.actorAuthUserId).filter((value): value is string => Boolean(value)),
  ));
  const users = subjects.length === 0
      ? []
      : await prisma.user.findMany({
        where: { authUserId: { in: subjects } },
        select: { id: true, authUserId: true, role: true },
      });
  const userBySubject = new Map(users.map((user) => [user.authUserId, user]));

  return events.map((event) => {
    const payload = objectPayload(event.payload);
    const user = event.actorAuthUserId ? userBySubject.get(event.actorAuthUserId) : undefined;
    const storedReference = stringField(payload, "incidentReference");

    return {
      id: event.id,
      occurredAt: event.occurredAt,
      incidentReference: storedReference && /^INC-[A-F0-9]{10}$/.test(storedReference)
      ? storedReference
      : `INC-${accountSupportReference(event.externalId)}`,
      accountCurrentRole: user?.role ?? null,
      roleAtIncident: roleField(payload, "roleAtIncident"),
      accountReference: accountSupportReference(user?.id ?? event.actorAuthUserId ?? event.externalId),
      route: normalizeCustomerIncidentRoute(stringField(payload, "route")),
      environment: stringField(payload, "environment"),
      revision: stringField(payload, "revision"),
    };
  });
}
