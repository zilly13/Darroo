import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rawItems } from "../../db/schema.js";
import { checkRelevance } from "../../ai/prompts/relevance.js";
import { reportError } from "../../notify/index.js";
import type { ChannelConfig, RunStats } from "../types.js";

/**
 * Cheap-model pass over every freshly collected item: does it actually fit
 * the channel? This runs on EVERY candidate (that's the point of using the
 * cheap model here and reserving the strong one for writing).
 */
export async function filterRelevance(config: ChannelConfig, runLogId: string, stats: RunStats): Promise<void> {
  const pending = await db
    .select()
    .from(rawItems)
    .where(and(eq(rawItems.channelSlug, config.slug), eq(rawItems.status, "pending")));

  for (const item of pending) {
    try {
      const result = await checkRelevance({
        channelTopic: config.topic,
        title: item.title,
        excerpt: typeof item.rawPayload === "object" ? JSON.stringify(item.rawPayload).slice(0, 500) : undefined,
      });

      await db
        .update(rawItems)
        .set({
          status: result.relevant ? "relevant" : "rejected",
          rejectionReason: result.relevant ? null : result.reason,
        })
        .where(eq(rawItems.id, item.id));

      if (!result.relevant) stats.itemsRejected += 1;
    } catch (err) {
      await reportError({
        runLogId,
        channelSlug: config.slug,
        step: "relevanceFilter",
        message: `Relevanz-Check fehlgeschlagen für "${item.title}": ${(err as Error).message}`,
        context: { rawItemId: item.id },
      });
    }
  }
}
