import { htmlCollector } from "./html.js";
import { icalCollector } from "./ical.js";
import { rssCollector } from "./rss.js";
import type { Collector, SourceDefinition } from "./types.js";

const collectorsByKind: Record<SourceDefinition["kind"], Collector> = {
  rss: rssCollector,
  ical: icalCollector,
  html: htmlCollector,
};

export function getCollector(kind: SourceDefinition["kind"]): Collector {
  const collector = collectorsByKind[kind];
  if (!collector) throw new Error(`No collector registered for kind "${kind}"`);
  return collector;
}

export type { CollectContext, CollectedItem, CollectResult, Collector, SourceDefinition } from "./types.js";
