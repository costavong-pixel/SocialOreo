import { UserRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export async function getUserRoleByAuthUserId(authUserId: string): Promise<UserRole | null> {
  const user = await prisma.user.findUnique({
    where: { authUserId },
    select: { role: true },
  });

  return user?.role ?? null;
}

export async function requireAdminByAuthUserId(authUserId: string): Promise<boolean> {
  const role = await getUserRoleByAuthUserId(authUserId);
  return role !== null && isAdminRole(role);
}
