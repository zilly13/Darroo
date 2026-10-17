import type { ChannelConfig } from "../../pipeline/types.js";

/**
 * Family-channel news/events (separate from the Orte-Datenbank, which is
 * its own module in src/places/ for timeless destinations). Same pipeline,
 * different topic + sources - this is the "new channel = config" promise
 * in practice. Replace the TODO sources with the real ones.
 */
export const familiesMunichChannel: ChannelConfig = {
  slug: "familien-muenchen",
  name: "darroo Familien München",
  topic:
    "Veranstaltungen und Angebote für Familien mit Kindern in München: Ferienprogramme, " +
    "Familienfeste, Kindertheater, kostenlose Workshops. Keine reinen Produktwerbungen.",
  clusterSimilarityThreshold: 0.6,
  sources: [
    {
      name: "TODO: Familienportal der Stadt München (RSS)",
      kind: "rss",
      url: "https://example.org/TODO-familien-muenchen.rss",
      trustTier: "primary",
    },
  ],
};
