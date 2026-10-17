import * as cheerio from "cheerio";
import { z } from "zod";
import { completeJson, FILTER_MODEL } from "../ai/client.js";
import { db } from "../db/client.js";
import { places } from "../db/schema.js";
import { logger } from "../utils/logger.js";

export const newPlaceFormSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  websiteUrl: z.string().url().optional(),
  notes: z.string().optional(), // free-text hint from whoever submits the form
});
export type NewPlaceForm = z.infer<typeof newPlaceFormSchema>;

const enrichmentSchema = z.object({
  description: z.string().describe("2-3 Sätze, die den Ort für einen WhatsApp-Post beschreiben."),
  category: z.string(),
  ageGroup: z.string().describe("z.B. '0-3', '4-6', '7-12', 'alle'"),
  district: z.string().nullable(),
  indoor: z.boolean(),
  requiresGoodWeather: z.boolean(),
  seasons: z.array(z.enum(["winter", "spring", "summer", "autumn"])).describe("leer = ganzjährig"),
});

async function fetchPageExcerpt(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "darroo-bot/1.0" } });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer").remove();
    return $("body").text().replace(/\s+/g, " ").trim().slice(0, 2000);
  } catch (err) {
    logger.warn({ err, url }, "Could not fetch website for place enrichment, continuing without it");
    return "";
  }
}

/**
 * "Neuer Ort per kurzem Formular, KI recherchiert den Rest" (project notes).
 * We don't have a paid web-search API wired up, so "recherchiert" here means:
 * read the submitted website (if any) and let the AI turn name + address +
 * notes + that page into the structured fields the Orte-Datenbank needs.
 * New places land as "needs_review" so a human skims them once before they
 * ever get posted - cheap AI fields, human final say.
 */
export async function createPlaceFromForm(form: NewPlaceForm) {
  const pageExcerpt = form.websiteUrl ? await fetchPageExcerpt(form.websiteUrl) : "";

  const enrichment = await completeJson({
    model: FILTER_MODEL,
    schemaName: "place_enrichment",
    schema: enrichmentSchema,
    system:
      "Du befüllst einen Datenbank-Eintrag für einen Ausflugsziel-Kanal für Familien in München. " +
      "Nutze die gegebenen Infos, erfinde keine Adressdetails. Wenn Informationen fehlen, triff " +
      "eine vorsichtige, plausible Annahme (z.B. 'alle' als Altersgruppe).",
    user: [
      `Name: ${form.name}`,
      form.address ? `Adresse: ${form.address}` : null,
      form.notes ? `Notizen: ${form.notes}` : null,
      pageExcerpt ? `Website-Auszug:\n${pageExcerpt}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const [created] = await db
    .insert(places)
    .values({
      name: form.name,
      address: form.address,
      websiteUrl: form.websiteUrl,
      description: enrichment.description,
      category: enrichment.category,
      ageGroup: enrichment.ageGroup,
      district: enrichment.district,
      indoor: enrichment.indoor,
      requiresGoodWeather: enrichment.requiresGoodWeather,
      seasons: enrichment.seasons.length > 0 ? enrichment.seasons : null,
      status: "needs_review",
    })
    .returning();

  return created!;
}
