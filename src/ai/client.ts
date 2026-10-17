import "dotenv/config";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not set (see .env.example)");
}

export const openai = new OpenAI({ apiKey });

/** Cheap model: used for every high-volume, low-stakes step (relevance filter, fraud pre-check). */
export const FILTER_MODEL = process.env.OPENAI_FILTER_MODEL ?? "gpt-4o-mini";
/** Strong model: used only for the final write step, where quality actually matters. */
export const WRITER_MODEL = process.env.OPENAI_WRITER_MODEL ?? "gpt-4o";

/**
 * Runs a chat completion constrained to a zod schema and returns the parsed,
 * typed result. Centralizing this keeps "which model for which step" a one-line
 * decision at the call site instead of duplicated OpenAI boilerplate everywhere.
 */
export async function completeJson<T extends z.ZodType>(opts: {
  model: string;
  schemaName: string;
  schema: T;
  system: string;
  user: string;
  temperature?: number;
}): Promise<z.infer<T>> {
  const completion = await openai.chat.completions.create({
    model: opts.model,
    temperature: opts.temperature ?? 0.2,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: zodResponseFormat(opts.schema, opts.schemaName),
  });

  const message = completion.choices[0]?.message;
  if (!message?.content) {
    throw new Error(`OpenAI returned no content for schema "${opts.schemaName}"`);
  }
  return opts.schema.parse(JSON.parse(message.content));
}
