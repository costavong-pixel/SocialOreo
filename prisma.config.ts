import "dotenv/config";
import { defineConfig } from "prisma/config";

const canUseOfflineDatabaseUrl = process.argv.some((arg) => arg === "generate" || arg === "validate");

if (!process.env.DATABASE_URL && canUseOfflineDatabaseUrl) {
  process.env.DATABASE_URL = "postgresql://localhost:5432/socialoreo";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
