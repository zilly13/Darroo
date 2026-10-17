import type { ChannelConfig } from "../../pipeline/types.js";

/**
 * Reference channel implementation. The sources below are PLACEHOLDERS -
 * swap them for the real organizer feeds/sites this channel already uses.
 * Nothing else needs to change to add a new source: one entry here.
 *
 *   - kind "rss"/"ical": just needs the feed URL.
 *   - kind "html": needs selectorConfig (CSS selectors) for a site with no feed.
 */
export const eventsMunichChannel: ChannelConfig = {
  slug: "events-muenchen",
  name: "darroo Events München",
  topic:
    "Events und Veranstaltungen in München: Konzerte, Märkte, Festivals, Ausstellungen, " +
    "Stadtfeste. Kein reiner Gastro-Tipp ohne Termin, keine überregionalen Online-Events.",
  clusterSimilarityThreshold: 0.6,
  sources: [
    {
      name: "TODO: Offizieller Veranstaltungskalender München (RSS)",
      kind: "rss",
      url: "https://example.org/TODO-muenchen-veranstaltungen.rss",
      trustTier: "primary",
    },
    {
      name: "TODO: Veranstalter-Website ohne Feed (HTML)",
      kind: "html",
      url: "https://example.org/TODO-veranstalter/termine",
      trustTier: "primary",
      selectorConfig: {
        item: ".event-list .event-item",
        title: ".event-title",
        link: "a",
        date: ".event-date",
        location: ".event-location",
      },
    },
    {
      name: "TODO: Lokales Stadtmagazin (sekundär, für Mehrfachnennungen)",
      kind: "rss",
      url: "https://example.org/TODO-stadtmagazin.rss",
      trustTier: "secondary",
    },
  ],
};
