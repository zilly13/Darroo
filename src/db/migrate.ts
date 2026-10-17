import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";
import { logger } from "../utils/logger.js";

async function main() {
  logger.info("Running migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Migrations applied.");
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "Migration failed");
  process.exit(1);
});
