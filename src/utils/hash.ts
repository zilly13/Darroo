import { createHash } from "node:crypto";

/**
 * Normalizes free text for fingerprinting: lowercase, collapse whitespace,
 * strip punctuation. Two headlines that differ only in casing or a trailing
 * "!" must hash the same, or duplicate protection misses them.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents (ä -> a etc. after NFKD)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fingerprint used for duplicate protection across runs (raw_items.content_hash)
 * and for listings. Same title + same day + same place = same fingerprint,
 * even if the source re-publishes it with slightly different wording.
 */
export function contentFingerprint(parts: {
  title: string;
  dateKey?: string | null; // e.g. an ISO date (day precision), not a timestamp
  location?: string | null;
}): string {
  const normalizedTitle = normalize(parts.title);
  const normalizedLocation = parts.location ? normalize(parts.location) : "";
  const dateKey = parts.dateKey ?? "";
  const payload = `${normalizedTitle}|${dateKey}|${normalizedLocation}`;
  return createHash("sha256").update(payload).digest("hex");
}

/** Cheap token-overlap similarity (0..1), used to cluster near-duplicate titles. */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}
