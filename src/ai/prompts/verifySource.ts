import { z } from "zod";
import { completeJson, FILTER_MODEL } from "../client.js";

export const verifySourceSchema = z.object({
  isPrimarySource: z.boolean(),
  organizerName: z.string().nullable().describe("The organizer/venue name if identifiable, else null."),
  reason: z.string(),
});

/**
 * "Prüfung an der Primärquelle" (project notes): facts should come from the
 * organizer directly, not from a ticket reseller or news aggregator that
 * merely links to the event. This step classifies the page itself, it does
 * not re-verify the event's facts (that happens implicitly by only trusting
 * primary-tier content for writing).
 */
export async function verifyIsPrimarySource(params: { url: string; pageTitle: string; pageExcerpt: string }) {
  return completeJson({
    model: FILTER_MODEL,
    schemaName: "verify_source",
    schema: verifySourceSchema,
    system:
      "Du prüfst, ob eine Webseite die offizielle Seite des Veranstalters/Betreibers ist " +
      "(Primärquelle) oder nur ein Ticketportal, Presseartikel, Aggregator oder Social-Media-Post, " +
      "der über das Event berichtet. Nur echte Veranstalter-/Betreiberseiten sind Primärquellen.",
    user: `URL: ${params.url}\nTitel: ${params.pageTitle}\nAuszug: ${params.pageExcerpt}`,
  });
}
