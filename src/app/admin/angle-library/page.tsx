import Link from "next/link";
import { redirect } from "next/navigation";

import { AngleLibraryAdmin } from "@/components/angle-library/angle-library-admin";
import { serializeAngle } from "@/lib/angle-library/serialize-angle";
import { getSessionUser } from "@/lib/auth/current-user";
import { requireAdminByAuthUserId } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/prisma";
import { ProductFrame } from "@/components/layout/product-frame";

export default async function AngleLibraryPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/auth/login");
  }

  const isAdmin = await requireAdminByAuthUserId(user.id);

  if (!isAdmin) {
    return (
      <ProductFrame backHref="/dashboard" backLabel="Workspace" maxWidth="narrow">
        <section className="so-admin mt-6">
          <div className="mt-10 rounded-[2rem] border border-black/10 bg-white/70 p-6 shadow-sm md:p-10">
            <h1 className="text-3xl font-black tracking-[-0.04em]">Admin access required</h1>
            <p className="mt-4 text-black/70">
              The Viral Angle Library is restricted to SocialOreo admins.
            </p>
            <p className="mt-3 text-sm text-black/55">
              Promote your user to <code>ADMIN</code> in the database after first sign-in.
            </p>
          </div>
        </section>
      </ProductFrame>
    );
  }

  const angles = await prisma.angleLibrary.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  return (
    <ProductFrame backHref="/dashboard" backLabel="Workspace">
      <section className="so-admin">
        <AngleLibraryAdmin initialAngles={angles.map(serializeAngle)} />
      </section>
    </ProductFrame>
  );
}
