import { prisma } from "@/lib/db/prisma";
import { getOrCreatePersonalWorkspace } from "@/lib/socialolla/workspace";

const expectedEmail = (process.env.STAGING_EXPECTED_EMAIL ?? "info@slabburgers.com").trim().toLowerCase();
const subject = process.env.STAGING_AUTH0_SUBJECT?.trim();

if (process.env.SOCIALOLLA_ENV !== "staging") throw new Error("Refusing identity repair unless SOCIALOLLA_ENV=staging.");
if (process.env.APP_ENV === "production" || !process.env.DATABASE_URL || /production|prod\b/i.test(process.env.DATABASE_URL)) throw new Error("Refusing identity repair against an unapproved database URL.");
if (!subject) throw new Error("STAGING_AUTH0_SUBJECT is required; do not guess an Auth0 subject.");

try {
  const user = await prisma.user.findUnique({ where: { authUserId: subject }, select: { id: true, email: true, role: true } });
  if (!user) throw new Error("The supplied Auth0 subject is not present in the staging database.");
  if (user.email.trim().toLowerCase() !== expectedEmail) throw new Error("The supplied Auth0 subject does not match the expected staging email.");
  const updated = user.role === "USER" ? user : await prisma.user.update({ where: { id: user.id }, data: { role: "USER" }, select: { id: true, email: true, role: true } });
  const workspace = await getOrCreatePersonalWorkspace(updated.id);
  process.stdout.write(`${JSON.stringify({ environment: "staging", auth0Subject: subject, email: updated.email, role: updated.role, workspaceId: workspace.id })}\n`);
} finally {
  await prisma.$disconnect();
}
