import cron from "node-cron";
import { channels } from "../config/channels/index.js";
import { runChannelPipeline } from "../pipeline/run.js";
import { pickAndPostPlaces } from "../places/scheduler.js";
import { reportError } from "../notify/index.js";
import { logger } from "../utils/logger.js";

/**
 * All scheduling lives in this one Node process (the same one serving the
 * internal web UI) instead of N separate systemd timers or an n8n
 * scheduler trigger - one process to deploy, monitor and pay for.
 */
export function startScheduler() {
  // Every 2 hours: collect, filter, cluster, verify, write for every channel.
  cron.schedule(
    "0 */2 * * *",
    async () => {
      for (const channel of channels) {
        try {
          await runChannelPipeline(channel);
        } catch (err) {
          logger.error({ err, channel: channel.slug }, "Scheduled pipeline run failed");
          // runChannelPipeline already reports the error itself; no double-report here.
        }
      }
    },
    { timezone: "Europe/Berlin" },
  );

  // Twice a day: post the longest-unused eligible place.
  cron.schedule(
    "0 9,15 * * *",
    async () => {
      try {
        const posted = await pickAndPostPlaces(1);
        logger.info({ posted }, "Places scheduler run finished");
      } catch (err) {
        await reportError({
          channelSlug: "familien-muenchen",
          step: "places.scheduler",
          message: `Orte-Posting-Lauf fehlgeschlagen: ${(err as Error).message}`,
        });
      }
    },
    { timezone: "Europe/Berlin" },
  );

  logger.info("Cron scheduler started (pipeline every 2h, places at 09:00 & 15:00 Europe/Berlin)");
}
