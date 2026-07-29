import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

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
