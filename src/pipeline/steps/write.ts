import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { clusterMembers, itemClusters, posts, rawItems } from "../../db/schema.js";
import { writePost, type SourceForWriting } from "../../ai/prompts/write.js";
import { reportError } from "../../notify/index.js";
import type { ChannelConfig, RunStats } from "../types.js";

const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://darroo.com";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * Strong-model step, runs ONCE per verified cluster (never per raw item) -
 * that's where the expensive model's cost is kept down even as more sources
 * get added per channel.
 */
export async function writeVerifiedClusters(config: ChannelConfig, runLogId: string, stats: RunStats): Promise<void> {
  const verifiedClusters = await db
    .select()
    .from(itemClusters)
    .where(
      and(
        eq(itemClusters.channelSlug, config.slug),
        eq(itemClusters.verifiedPrimarySource, true),
      ),
    );

  for (const cluster of verifiedClusters) {
    // Skip clusters that already produced a post (idempotent re-runs).
    const [existingPost] = await db.select().from(posts).where(eq(posts.clusterId, cluster.id));
    if (existingPost) continue;

    const members = await db
      .select({ rawItem: rawItems })
      .from(clusterMembers)
      .innerJoin(rawItems, eq(clusterMembers.rawItemId, rawItems.id))
      .where(eq(clusterMembers.clusterId, cluster.id));

    if (members.length === 0) continue;
    const primary = members.find((m) => m.rawItem.id === cluster.primaryRawItemId)?.rawItem ?? members[0]!.rawItem;

    const sourcesForWriting: SourceForWriting[] = members.map((m) => ({
      name: m.rawItem.url ? new URL(m.rawItem.url).hostname : "Quelle",
      url: m.rawItem.url ?? "",
      excerpt: m.rawItem.title,
    }));

    try {
      const written = await writePost({
        channelTopic: config.topic,
        title: primary.title,
        eventDateLabel: primary.eventDate?.toLocaleDateString("de-DE"),
        location: primary.location ?? undefined,
        sources: sourcesForWriting,
        siteUrl,
      });

      await db.insert(posts).values({
        channelSlug: config.slug,
        clusterId: cluster.id,
        title: written.title,
        shortText: written.shortText,
        longText: written.longText,
        sourceLinks: sourcesForWriting.map((s) => ({ name: s.name, url: s.url })),
        eventDate: primary.eventDate,
        location: primary.location,
        status: "ready",
        websiteSlug: `${slugify(written.title)}-${cluster.id.slice(0, 8)}`,
      });

      await db
        .update(rawItems)
        .set({ status: "written" })
        .where(inArray(rawItems.id, members.map((m) => m.rawItem.id)));

      stats.postsWritten += 1;
    } catch (err) {
      await reportError({
        runLogId,
        channelSlug: config.slug,
        step: "write",
        message: `Text-Erstellung fehlgeschlagen für Cluster ${cluster.id}: ${(err as Error).message}`,
        context: { clusterId: cluster.id },
      });
    }
  }
}
