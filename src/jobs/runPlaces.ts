import "dotenv/config";
import { pool } from "../db/client.js";
import { pickAndPostPlaces } from "../places/scheduler.js";
import { logger } from "../utils/logger.js";

/** Manual/alternative entrypoint: `npm run run:places` */
async function main() {
  const posted = await pickAndPostPlaces(1);
  logger.info({ posted }, "Done");
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "runPlaces failed");
  process.exit(1);
});
