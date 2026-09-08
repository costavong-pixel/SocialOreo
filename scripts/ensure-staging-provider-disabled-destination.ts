import { prisma } from "@/lib/db/prisma";
import { ensureStagingProviderDisabledDestination } from "@/lib/socialolla/staging/provider-disabled-destination-fixture";

async function main(): Promise<void> {
  const result = await ensureStagingProviderDisabledDestination(process.env, prisma);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Staging destination fixture failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
