/** One unprocessed candidate item as it comes out of a collector, before any filtering. */
export interface CollectedItem {
  externalId: string; // guid/link - used as the freshness cursor
  url?: string;
  title: string;
  eventDate?: Date;
  location?: string;
  raw: Record<string, unknown>;
}

export interface CollectContext {
  /** Bookmark from the previous successful run (sources.last_cursor). Collectors decide its shape. */
  cursor: unknown;
}

export interface CollectResult {
  items: CollectedItem[];
  /** New bookmark to persist on sources.last_cursor for the next run. */
  nextCursor: unknown;
}

export interface SourceDefinition {
  name: string;
  kind: "rss" | "ical" | "html";
  url: string;
  trustTier: "primary" | "secondary";
  /** Only used by the "html" collector. */
  selectorConfig?: {
    item: string;
    title: string;
    link?: string;
    date?: string;
    location?: string;
  };
}

export interface Collector {
  kind: SourceDefinition["kind"];
  collect(source: SourceDefinition, ctx: CollectContext): Promise<CollectResult>;
}
