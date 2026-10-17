import { z } from "zod";
import { completeJson, FILTER_MODEL } from "../client.js";

export const relevanceSchema = z.object({
  relevant: z.boolean(),
  reason: z.string().describe("One short sentence: why this fits or doesn't fit the channel."),
});

/**
 * Cheap, high-volume step: "does this fit the channel topic at all?".
 * Deliberately not a keyword search (the project notes call that out as the
 * old n8n weakness) - the model judges fit, not word overlap.
 */
export async function checkRelevance(params: {
  channelTopic: string; // plain-language description of what belongs in this channel
  title: string;
  excerpt?: string;
}) {
  return completeJson({
    model: FILTER_MODEL,
    schemaName: "relevance",
    schema: relevanceSchema,
    system:
      "Du bist ein strenger Redakteur für einen lokalen WhatsApp-Kanal in München. " +
      "Entscheide NUR, ob ein gefundener Eintrag inhaltlich zum Kanal passt. " +
      "Sei konservativ: im Zweifel nicht relevant.",
    user: [
      `Kanal-Thema: ${params.channelTopic}`,
      `Titel: ${params.title}`,
      params.excerpt ? `Auszug: ${params.excerpt}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
