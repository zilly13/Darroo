import { z } from "zod";
import { completeJson, FILTER_MODEL } from "../client.js";

export const fraudCheckSchema = z.object({
  suspicious: z.boolean(),
  score: z.number().min(0).max(1).describe("0 = unauffällig, 1 = eindeutig verdächtig"),
  reasons: z.array(z.string()),
});

/**
 * "KI-Prüfung auf Betrugsmuster" for paid listings (project notes). Cheap
 * model, runs on every submission before a human ever sees it - this is a
 * pre-filter, not the final word: a high score routes to manual review,
 * it never auto-rejects a paying customer.
 */
export async function checkListingForFraud(params: {
  listingType: string;
  title: string;
  description: string;
  priceLabel?: string;
  contactEmail?: string;
}) {
  return completeJson({
    model: FILTER_MODEL,
    schemaName: "fraud_check",
    schema: fraudCheckSchema,
    system:
      "Du prüfst Kleinanzeigen (z.B. Immobilien) auf typische Betrugsmuster: unrealistisch " +
      "niedriger Preis, Druck zur Vorauszahlung, Vermieter angeblich im Ausland, Kontakt nur " +
      "per Wegwerf-E-Mail, kopierter/generischer Text, keine konkrete Adresse. " +
      "Ein hoher Score bedeutet nur 'genauer prüfen', nicht automatisch ablehnen.",
    user: [
      `Typ: ${params.listingType}`,
      `Titel: ${params.title}`,
      params.priceLabel ? `Preis: ${params.priceLabel}` : null,
      params.contactEmail ? `Kontakt-E-Mail: ${params.contactEmail}` : null,
      `Beschreibung:\n${params.description}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
