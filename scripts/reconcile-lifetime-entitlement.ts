import { prisma } from "@/lib/db/prisma";
import { reconcileLifetimeEntitlement } from "@/lib/socialolla/entitlements/entitlement-service";

function parseOwnerUserId(args: string[]): string {
  if (args.length !== 1 || !args[0].startsWith("--user-id=")) {
    throw new Error("Usage: npm run production:reconcile-lifetime -- --user-id=<internal-user-id>");
  }

  const ownerUserId = args[0].slice("--user-id=".length).trim();
  if (!ownerUserId || !/^[A-Za-z0-9_-]+$/.test(ownerUserId)) {
    throw new Error("--user-id must contain one explicit internal user identifier");
  }
  return ownerUserId;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.SOCIALOLLA_ENV !== "production") {
    throw new Error("Refusing Lifetime entitlement reconciliation unless NODE_ENV=production and SOCIALOLLA_ENV=production.");
  }
  const ownerUserId = parseOwnerUserId(process.argv.slice(2));
  const result = await reconcileLifetimeEntitlement({ ownerUserId });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Lifetime entitlement reconciliation failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
