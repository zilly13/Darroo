import "dotenv/config";
import { pool } from "../db/client.js";
import { getChannel, channels } from "../config/channels/index.js";
import { runChannelPipeline } from "../pipeline/run.js";
import { logger } from "../utils/logger.js";

/**
 * Manual/alternative entrypoint: `npm run run:channel -- --channel=events-muenchen`
 * Useful for testing a single channel, or if you'd rather drive scheduling
 * from system crontab than from the in-process scheduler (see jobs/scheduler.ts).
 */
async function main() {
  const arg = process.argv.find((a) => a.startsWith("--channel="));
  const slug = arg?.split("=")[1];

  const targets = slug ? [getChannel(slug)] : channels;
  for (const channel of targets) {
    const stats = await runChannelPipeline(channel);
    logger.info({ channel: channel.slug, stats }, "Done");
  }
  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, "runChannel failed");
  process.exit(1);
});
