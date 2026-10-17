import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { clusterMembers, itemClusters, rawItems, sources } from "../../db/schema.js";
import { titleSimilarity } from "../../utils/hash.js";
import type { ChannelConfig, RunStats } from "../types.js";

const DEFAULT_SIMILARITY_THRESHOLD = 0.6;

/**
 * Groups items that are almost certainly the same real-world event (same
 * day, similar title) into one cluster, so three articles about one event
 * become one post with several sources - and the number of independent
 * mentions becomes a relevance signal (project notes: "Erwähnungen in
 * mehreren Medien zählen").
 */
export async function clusterRelevantItems(config: ChannelConfig, stats: RunStats): Promise<void> {
  const threshold = config.clusterSimilarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

  const relevantItems = await db
    .select()
    .from(rawItems)
    .where(and(eq(rawItems.channelSlug, config.slug), eq(rawItems.status, "relevant")));

  const trustBySourceId = new Map<string, "primary" | "secondary">();
  const sourceRows = await db.select().from(sources).where(eq(sources.channelSlug, config.slug));
  for (const s of sourceRows) trustBySourceId.set(s.id, s.trustTier as "primary" | "secondary");

  const unclustered = [...relevantItems];
  const clusters: (typeof relevantItems)[] = [];

  while (unclustered.length > 0) {
    const seed = unclustered.shift()!;
    const group = [seed];

    for (let i = unclustered.length - 1; i >= 0; i -= 1) {
      const candidate = unclustered[i]!;
      const sameDay =
        seed.eventDate &&
        candidate.eventDate &&
        seed.eventDate.toISOString().slice(0, 10) === candidate.eventDate.toISOString().slice(0, 10);
      const similar = titleSimilarity(seed.title, candidate.title) >= threshold;
      if (sameDay && similar) {
        group.push(candidate);
        unclustered.splice(i, 1);
      }
    }
    clusters.push(group);
  }

  for (const group of clusters) {
    // Prefer a primary-tier source as the cluster's primary item - its facts
    // are trusted directly, skipping an AI verification call later.
    const primary =
      group.find((item) => item.sourceId && trustBySourceId.get(item.sourceId) === "primary") ?? group[0]!;

    const [cluster] = await db
      .insert(itemClusters)
      .values({
        channelSlug: config.slug,
        primaryRawItemId: primary.id,
        verifiedPrimarySource: trustBySourceId.get(primary.sourceId ?? "") === "primary",
      })
      .returning();

    await db
      .insert(clusterMembers)
      .values(group.map((item) => ({ clusterId: cluster!.id, rawItemId: item.id })));

    await db
      .update(rawItems)
      .set({ status: "clustered", mentionCount: group.length })
      .where(inArray(rawItems.id, group.map((item) => item.id)));

    stats.clustersCreated += 1;
  }
}
