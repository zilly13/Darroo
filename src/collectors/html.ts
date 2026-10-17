import * as cheerio from "cheerio";
import type { CollectContext, CollectResult, Collector, SourceDefinition } from "./types.js";

interface HtmlCursor {
  seenIds: string[];
}

const MAX_CURSOR_IDS = 200;

/**
 * Generic HTML collector for Munich organizer sites that have no feed.
 * Driven entirely by `source.selectorConfig` (CSS selectors) - adding a new
 * such source is a config entry, never a new collector.
 */
export const htmlCollector: Collector = {
  kind: "html",
  async collect(source: SourceDefinition, ctx: CollectContext): Promise<CollectResult> {
    const config = source.selectorConfig;
    if (!config) {
      throw new Error(`Source "${source.name}" is kind=html but has no selectorConfig`);
    }

    const cursor = (ctx.cursor as HtmlCursor | undefined) ?? { seenIds: [] };
    const seen = new Set(cursor.seenIds);

    const res = await fetch(source.url, { headers: { "user-agent": "darroo-bot/1.0" } });
    if (!res.ok) {
      throw new Error(`HTML fetch failed for ${source.url}: HTTP ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const collected: CollectResult["items"] = [];
    const newIds: string[] = [];

    $(config.item).each((_, el) => {
      const node = $(el);
      const title = config.title ? node.find(config.title).first().text().trim() : "";
      let link = config.link ? node.find(config.link).first().attr("href") : undefined;
      if (link && !link.startsWith("http")) {
        link = new URL(link, source.url).toString();
      }
      const dateText = config.date ? node.find(config.date).first().text().trim() : undefined;
      const location = config.location ? node.find(config.location).first().text().trim() : undefined;

      if (!title) return;
      const externalId = link ?? title;
      newIds.push(externalId);
      if (seen.has(externalId)) return;

      collected.push({
        externalId,
        url: link,
        title,
        eventDate: dateText ? new Date(dateText) : undefined,
        location,
        raw: { html: node.html() },
      });
    });

    const nextCursor: HtmlCursor = { seenIds: [...newIds, ...cursor.seenIds].slice(0, MAX_CURSOR_IDS) };
    return { items: collected, nextCursor };
  },
};
