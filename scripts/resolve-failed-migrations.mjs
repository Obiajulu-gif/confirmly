import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

const prisma = new PrismaClient();
const npmCommand = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  const failedMigrations = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL'
  );

  if (Array.isArray(failedMigrations) && failedMigrations.length > 0) {
    for (const row of failedMigrations) {
      const name = row.migration_name;
      console.log(`Found failed migration in database: ${name}. Resolving status...`);

      const result = spawnSync(
        npmCommand,
        ["prisma", "migrate", "resolve", "--rolled-back", name],
        {
          stdio: "inherit",
          shell: process.platform === "win32",
          env: process.env,
        }
      );

      if (result.status === 0) {
        console.log(`Successfully resolved migration ${name} as rolled back.`);
      } else {
        console.warn(
          `Prisma CLI resolve exited with status ${result.status}. Updating table directly.`
        );
        await prisma.$executeRawUnsafe(
          'UPDATE "_prisma_migrations" SET rolled_back_at = NOW() WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL',
          name
        );
        console.log(`Directly updated _prisma_migrations for ${name}.`);
      }
    }
  } else {
    console.log("No failed migrations detected in _prisma_migrations.");
  }
} catch (err) {
  console.warn("Could not check for failed migrations:", err instanceof Error ? err.message : err);
} finally {
  await prisma.$disconnect();
}
