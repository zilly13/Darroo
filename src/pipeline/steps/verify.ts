import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { itemClusters, rawItems } from "../../db/schema.js";
import { verifyIsPrimarySource } from "../../ai/prompts/verifySource.js";
import { reportError } from "../../notify/index.js";
import type { ChannelConfig, RunStats } from "../types.js";

/**
 * A cluster whose primary item already came from a "primary" tier source
 * (set in cluster.ts) is trusted without an extra AI call - that's the
 * whole point of maintaining trust tiers per source instead of re-checking
 * every single time. Everything else gets one classification call: is the
 * linked page really the organizer's own page, or just a ticket portal /
 * news aggregator that happened to rank first?
 */
export async function verifyPrimarySources(config: ChannelConfig, runLogId: string, stats: RunStats): Promise<void> {
  const clusters = await db
    .select()
    .from(itemClusters)
    .where(and(eq(itemClusters.channelSlug, config.slug), eq(itemClusters.verifiedPrimarySource, false)));

  for (const cluster of clusters) {
    if (!cluster.primaryRawItemId) continue;
    const [primaryItem] = await db.select().from(rawItems).where(eq(rawItems.id, cluster.primaryRawItemId));
    if (!primaryItem || !primaryItem.url) {
      await db
        .update(itemClusters)
        .set({ verificationNote: "Kein Link zur Primärquelle vorhanden - manuell prüfen." })
        .where(eq(itemClusters.id, cluster.id));
      continue;
    }

    try {
      const result = await verifyIsPrimarySource({
        url: primaryItem.url,
        pageTitle: primaryItem.title,
        pageExcerpt:
          typeof primaryItem.rawPayload === "object" ? JSON.stringify(primaryItem.rawPayload).slice(0, 500) : "",
      });

      await db
        .update(itemClusters)
        .set({
          verifiedPrimarySource: result.isPrimarySource,
          verificationNote: result.reason,
        })
        .where(eq(itemClusters.id, cluster.id));
    } catch (err) {
      await reportError({
        runLogId,
        channelSlug: config.slug,
        step: "verify",
        message: `Primärquellen-Check fehlgeschlagen für Cluster ${cluster.id}: ${(err as Error).message}`,
        context: { clusterId: cluster.id },
      });
    }
  }
}
