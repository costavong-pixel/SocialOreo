import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";

type Auth0User = {
  id: string;
  email: string;
};

export async function syncUserFromAuth0(authUser: Auth0User) {
  return prisma.user.upsert({
    where: { authUserId: authUser.id },
    update: { email: authUser.email },
    create: {
      authUserId: authUser.id,
      email: authUser.email,
      role: UserRole.USER,
      creditAccount: {
        create: {
          balance: 0,
        },
      },
    },
    include: {
      creditAccount: true,
    },
  });
}

/**
 * Resolve a verified session to the DB User row. Workspace.ownerUserId
 * references User.id (the DB primary key), NOT the Auth0 sub, so every
 * workspace-scoped page/action must use dbUserId for ownership keys.
 */
export async function resolveDbUserFromVerifiedSession() {
  const sessionUser = await getVerifiedSessionUser();
  if (!sessionUser) return null;
  const dbUser = await syncUserFromAuth0({ id: sessionUser.id, email: sessionUser.email });
  return { dbId: dbUser.id, authUserId: dbUser.authUserId, email: dbUser.email };
}
