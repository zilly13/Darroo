import { XMLParser } from "fast-xml-parser";
import type { CollectContext, CollectResult, Collector, SourceDefinition } from "./types.js";

interface RssCursor {
  seenGuids: string[]; // small rolling window, enough to catch feed re-ordering
}

const MAX_CURSOR_GUIDS = 200;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Generic RSS/Atom collector. Freshness is a simple seen-guid window rather
 * than a single "last date", because feeds sometimes insert older items
 * out of order - a pure date cursor would silently swallow those.
 */
export const rssCollector: Collector = {
  kind: "rss",
  async collect(source: SourceDefinition, ctx: CollectContext): Promise<CollectResult> {
    const cursor = (ctx.cursor as RssCursor | undefined) ?? { seenGuids: [] };
    const seen = new Set(cursor.seenGuids);

    const res = await fetch(source.url, { headers: { "user-agent": "darroo-bot/1.0" } });
    if (!res.ok) {
      throw new Error(`RSS fetch failed for ${source.url}: HTTP ${res.status}`);
    }
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const doc = parser.parse(xml);

    // Support both RSS 2.0 (<rss><channel><item>) and Atom (<feed><entry>).
    const rssItems = toArray(doc?.rss?.channel?.item);
    const atomEntries = toArray(doc?.feed?.entry);

    const items = rssItems.length > 0 ? rssItems : atomEntries;
    const collected: CollectResult["items"] = [];
    const newGuids: string[] = [];

    for (const item of items) {
      const guid: string | undefined = item.guid?.["#text"] ?? item.guid ?? item.id ?? item.link;
      const link: string | undefined =
        typeof item.link === "string" ? item.link : item.link?.["@_href"] ?? item.link?.["#text"];
      const title: string | undefined = item.title?.["#text"] ?? item.title;
      const pubDateRaw: string | undefined = item.pubDate ?? item.published ?? item.updated;

      if (!guid || !title) continue;
      newGuids.push(guid);
      if (seen.has(guid)) continue; // already processed in a previous run

      collected.push({
        externalId: guid,
        url: link,
        title,
        eventDate: pubDateRaw ? new Date(pubDateRaw) : undefined,
        raw: item,
      });
    }

    const nextCursor: RssCursor = {
      seenGuids: [...newGuids, ...cursor.seenGuids].slice(0, MAX_CURSOR_GUIDS),
    };

    return { items: collected, nextCursor };
  },
};
