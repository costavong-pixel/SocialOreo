import { redirect } from "next/navigation";

import { AngleLibraryAdmin } from "@/components/angle-library/angle-library-admin";
import { serializeAngle } from "@/lib/angle-library/serialize-angle";
import { getVerifiedSessionUser } from "@/lib/auth/current-user";
import { hasDbSessionIdentityConflict, resolveDbUserFromVerifiedSession } from "@/lib/auth/sync-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";

export async function AngleLibraryPageContent() {
  const sessionUser = await getVerifiedSessionUser();
  const resolution = await resolveDbUserFromVerifiedSession();

  if (hasDbSessionIdentityConflict(resolution)) redirect("/account-conflict");
  if (!sessionUser || !resolution) {
    redirect("/auth/login");
  }

  const isAdmin = await requireAdminByAuthUserId(resolution.authUserId);

  if (!isAdmin) {
    redirect("/home");
  }

  const angles = await prisma.angleLibrary.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return <section className="so-admin"><AngleLibraryAdmin initialAngles={angles.map(serializeAngle)} /></section>;
}

export default async function AngleLibraryPage() {
  return <AngleLibraryPageContent />;
}
