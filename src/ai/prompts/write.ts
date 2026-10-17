import { z } from "zod";
import { completeJson, WRITER_MODEL } from "../client.js";

export const writeSchema = z.object({
  title: z.string().describe("Kurzer, griffiger Titel."),
  shortText: z
    .string()
    .describe("WhatsApp-Text: kurz, scanbar, keine Markdown-Links (WhatsApp rendert sie nicht als Links)."),
  longText: z
    .string()
    .describe("Längerer Text für darroo.com: mehr Kontext, Platz für Quellenangaben."),
});

export interface SourceForWriting {
  name: string;
  url: string;
  excerpt: string;
}

/**
 * Strong-model step: the only place in the pipeline where writing quality
 * (not classification) matters, so it is the only step allowed to use the
 * expensive model. Must genuinely rewrite, never copy sentences verbatim -
 * copying third-party text is explicitly called out as a legal/trust risk
 * in the project notes.
 */
export async function writePost(params: {
  channelTopic: string;
  title: string;
  eventDateLabel?: string;
  location?: string;
  sources: SourceForWriting[];
  siteUrl: string;
}) {
  const sourcesBlock = params.sources
    .map((s, i) => `Quelle ${i + 1} (${s.name}, ${s.url}):\n${s.excerpt}`)
    .join("\n\n");

  return completeJson({
    model: WRITER_MODEL,
    schemaName: "write_post",
    schema: writeSchema,
    temperature: 0.4,
    system:
      "Du schreibst für einen lokalen WhatsApp-Kanal in München. Schreibe IMMER mit eigenen Worten, " +
      "übernimm nie Satz für Satz aus den Quellen. shortText ist für WhatsApp: kurz, konkret, " +
      "mit Datum/Ort falls bekannt, endet mit einem Hinweis auf mehr Infos. longText ist für die " +
      "Webseite: etwas ausführlicher, nennt die Quellen am Ende als Klartext-URLs.",
    user: [
      `Kanal-Thema: ${params.channelTopic}`,
      `Titel-Vorschlag: ${params.title}`,
      params.eventDateLabel ? `Datum: ${params.eventDateLabel}` : null,
      params.location ? `Ort: ${params.location}` : null,
      `Website-Link, der im longText erwähnt werden soll: ${params.siteUrl}`,
      "",
      "Quellen (für Fakten, nicht zum Abschreiben):",
      sourcesBlock,
    ]
      .filter(Boolean)
      .join("\n"),
  });
}
