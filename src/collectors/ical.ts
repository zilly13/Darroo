import type { CollectContext, CollectResult, Collector, SourceDefinition } from "./types.js";

interface IcalCursor {
  seenUids: string[];
}

const MAX_CURSOR_UIDS = 200;

function unfoldLines(ics: string): string[] {
  // RFC 5545: a line starting with a space/tab continues the previous line.
  const rawLines = ics.split(/\r?\n/);
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDate(value: string): Date | undefined {
  // Handles YYYYMMDD and YYYYMMDDTHHMMSS[Z]
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(value);
  if (!match) return undefined;
  const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
  const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}${value.endsWith("Z") ? "Z" : ""}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Minimal VEVENT parser: enough for UID/SUMMARY/DTSTART/LOCATION/URL, no recurrence rules. */
function parseVevents(ics: string) {
  const lines = unfoldLines(ics);
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      current = {};
    } else if (line.startsWith("END:VEVENT")) {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const rawKey = line.slice(0, idx);
      const key = rawKey.split(";")[0] ?? rawKey; // drop params like DTSTART;TZID=...
      const value = line.slice(idx + 1);
      current[key] = value;
    }
  }
  return events;
}

export const icalCollector: Collector = {
  kind: "ical",
  async collect(source: SourceDefinition, ctx: CollectContext): Promise<CollectResult> {
    const cursor = (ctx.cursor as IcalCursor | undefined) ?? { seenUids: [] };
    const seen = new Set(cursor.seenUids);

    const res = await fetch(source.url, { headers: { "user-agent": "darroo-bot/1.0" } });
    if (!res.ok) {
      throw new Error(`iCal fetch failed for ${source.url}: HTTP ${res.status}`);
    }
    const ics = await res.text();
    const events = parseVevents(ics);

    const collected: CollectResult["items"] = [];
    const newUids: string[] = [];

    for (const event of events) {
      const uid = event.UID;
      const title = event.SUMMARY;
      if (!uid || !title) continue;
      newUids.push(uid);
      if (seen.has(uid)) continue;

      collected.push({
        externalId: uid,
        url: event.URL,
        title,
        eventDate: event.DTSTART ? parseIcsDate(event.DTSTART) : undefined,
        location: event.LOCATION,
        raw: event,
      });
    }

    const nextCursor: IcalCursor = { seenUids: [...newUids, ...cursor.seenUids].slice(0, MAX_CURSOR_UIDS) };
    return { items: collected, nextCursor };
  },
};
