import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rawItems, sources } from "../../db/schema.js";
import { getCollector } from "../../collectors/index.js";
import type { SourceDefinition } from "../../collectors/types.js";
import { reportError } from "../../notify/index.js";
import { contentFingerprint } from "../../utils/hash.js";
import { logger } from "../../utils/logger.js";
import type { ChannelConfig, RunStats } from "../types.js";

/** Ensures every source defined in code exists as a row in the DB (for cursor/lastRunAt tracking). */
async function upsertSourceRow(channelSlug: string, def: SourceDefinition) {
  const existing = await db
    .select()
    .from(sources)
    .where(and(eq(sources.channelSlug, channelSlug), eq(sources.url, def.url)))
    .limit(1);

  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(sources)
    .values({
      channelSlug,
      name: def.name,
      kind: def.kind,
      url: def.url,
      trustTier: def.trustTier,
      selectorConfig: def.selectorConfig,
    })
    .returning();
  return created!;
}

/**
 * Runs every configured source's collector, applies freshness (collector-side
 * cursor) and duplicate protection (content fingerprint, DB-side), and stores
 * new candidates as raw_items with status "pending". One source failing
 * (site down, feed broken) never stops the others - it's reported and skipped.
 */
export async function collectForChannel(config: ChannelConfig, runLogId: string, stats: RunStats): Promise<void> {
  for (const def of config.sources) {
    try {
      const sourceRow = await upsertSourceRow(config.slug, def);
      if (!sourceRow.enabled) continue;

      const collector = getCollector(def.kind);
      const result = await collector.collect(def, { cursor: sourceRow.lastCursor });

      for (const item of result.items) {
        const fingerprint = contentFingerprint({
          title: item.title,
          dateKey: item.eventDate ? item.eventDate.toISOString().slice(0, 10) : null,
          location: item.location,
        });

        const [inserted] = await db
          .insert(rawItems)
          .values({
            sourceId: sourceRow.id,
            channelSlug: config.slug,
            externalId: item.externalId,
            url: item.url,
            title: item.title,
            eventDate: item.eventDate,
            location: item.location,
            rawPayload: item.raw,
            contentHash: fingerprint,
            status: "pending",
          })
          .onConflictDoNothing({ target: [rawItems.channelSlug, rawItems.contentHash] })
          .returning();

        if (inserted) {
          stats.itemsCollected += 1;
        } else {
          stats.itemsDuplicate += 1;
        }
      }

      await db
        .update(sources)
        .set({ lastRunAt: new Date(), lastCursor: result.nextCursor })
        .where(eq(sources.id, sourceRow.id));

      stats.sourcesOk += 1;
    } catch (err) {
      stats.sourcesFailed += 1;
      logger.error({ err, source: def.name }, "Source collection failed");
      await reportError({
        runLogId,
        channelSlug: config.slug,
        step: "collect",
        message: `Quelle "${def.name}" (${def.url}) konnte nicht abgerufen werden: ${(err as Error).message}`,
        context: { sourceUrl: def.url },
      });
    }
  }
}
