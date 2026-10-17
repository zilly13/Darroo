import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { runLogs } from "../db/schema.js";
import { reportError } from "../notify/index.js";
import { logger } from "../utils/logger.js";
import { collectForChannel } from "./steps/collect.js";
import { clusterRelevantItems } from "./steps/cluster.js";
import { filterRelevance } from "./steps/relevanceFilter.js";
import { verifyPrimarySources } from "./steps/verify.js";
import { writeVerifiedClusters } from "./steps/write.js";
import type { ChannelConfig, RunStats } from "./types.js";

/**
 * Runs the full pipeline for one channel: collect -> filter -> cluster ->
 * verify -> write. Every step is wrapped so a failure in one step (or one
 * source within collect) is reported and the run still finishes and leaves
 * a stats trail - the exact opposite of "fails silently", which the project
 * notes name as the main problem with the old n8n setup.
 */
export async function runChannelPipeline(config: ChannelConfig): Promise<RunStats> {
  const stats: RunStats = {
    sourcesOk: 0,
    sourcesFailed: 0,
    itemsCollected: 0,
    itemsDuplicate: 0,
    itemsRejected: 0,
    clustersCreated: 0,
    postsWritten: 0,
  };

  const [runLog] = await db
    .insert(runLogs)
    .values({ channelSlug: config.slug, jobName: "pipeline", status: "running" })
    .returning();
  const runLogId = runLog!.id;

  logger.info({ channel: config.slug }, "Pipeline run started");

  try {
    await collectForChannel(config, runLogId, stats);
    await filterRelevance(config, runLogId, stats);
    await clusterRelevantItems(config, stats);
    await verifyPrimarySources(config, runLogId, stats);
    await writeVerifiedClusters(config, runLogId, stats);

    const status = stats.sourcesFailed > 0 ? "partial" : "success";
    await db
      .update(runLogs)
      .set({ finishedAt: new Date(), status, stats })
      .where(eq(runLogs.id, runLogId));

    logger.info({ channel: config.slug, stats }, "Pipeline run finished");
  } catch (err) {
    await db
      .update(runLogs)
      .set({ finishedAt: new Date(), status: "failed", stats, error: (err as Error).message })
      .where(eq(runLogs.id, runLogId));

    await reportError({
      runLogId,
      channelSlug: config.slug,
      step: "run",
      message: `Pipeline-Lauf abgebrochen: ${(err as Error).message}`,
    });
    throw err;
  }

  return stats;
}
