import { createHash } from "node:crypto";

import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

export const CUSTOMER_ERROR_EVENT = "CUSTOMER_ERROR_OBSERVED";

export const customerIncidentRequestSchema = z.object({
  clientEventId: z.string().uuid(),
  route: z.string().trim().min(1).max(200).regex(/^\/[A-Za-z0-9/_\-.~%:@]*$/),
  digest: z.string().trim().max(256).optional(),
}).strict();

export type CustomerIncidentInput = {
  dbUserId: string;
  authUserId: string;
  clientEventId: string;
  route: string;
  digest?: string;
};

export type CustomerIncidentResult = {
  status: "created" | "existing";
  incidentReference: string;
};

export class CustomerIncidentIdentityError extends Error {
  constructor() {
    super("The authenticated session does not match a canonical account.");
    this.name = "CustomerIncidentIdentityError";
  }
}

function runtimeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(trimmed) ? trimmed : null;
}

function incidentDigest(authUserId: string, clientEventId: string): string {
  return createHash("sha256")
    .update(`socialolla:customer-incident:v1:${authUserId}\u0000${clientEventId}`)
    .digest("hex");
}

function safeErrorDigest(value: string | undefined): string | null {
  return runtimeLabel(value);
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002",
  );
}

export async function recordCustomerIncident(
  input: CustomerIncidentInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CustomerIncidentResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.dbUserId },
    select: {
      id: true,
      authUserId: true,
      role: true,
      workspaces: { select: { id: true }, take: 1 },
    },
  });

  if (!user || user.authUserId !== input.authUserId) {
    throw new CustomerIncidentIdentityError();
  }

  const digest = incidentDigest(input.authUserId, input.clientEventId);
  const incidentReference = `INC-${digest.slice(0, 10).toUpperCase()}`;
  const errorDigest = safeErrorDigest(input.digest);
  const environment = runtimeLabel(env.SOCIALOLLA_ENV);
  const revision = runtimeLabel(
    env.SOCIALOLLA_REVISION ?? env.SOCIALOLLA_BUILD_REVISION ?? env.GIT_SHA,
  );

  try {
    await prisma.auditEvent.create({
      data: {
        externalId: `evt_customer_incident_${digest}`,
        actorAuthUserId: input.authUserId,
        workspaceId: user.workspaces[0]?.id ?? null,
        eventType: CUSTOMER_ERROR_EVENT,
        payload: {
          incidentReference,
          route: input.route,
          ...(errorDigest ? { errorDigest } : {}),
          roleAtIncident: user.role,
          ...(environment ? { environment } : {}),
          ...(revision ? { revision } : {}),
        },
      },
    });
    return { status: "created", incidentReference };
  } catch (error) {
    if (isUniqueConflict(error)) return { status: "existing", incidentReference };
    throw error;
  }
}
