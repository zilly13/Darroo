import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { places, posts } from "../db/schema.js";
import { reportError } from "../notify/index.js";
import { getTodayWeather } from "./weather.js";

const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://darroo.com";
const PLACES_CHANNEL_SLUG = "familien-muenchen";

function currentSeason(): "winter" | "spring" | "summer" | "autumn" {
  const month = new Date().getMonth() + 1; // 1-12
  if (month <= 2 || month === 12) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "autumn";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

type Place = typeof places.$inferSelect;

/**
 * Renders the post text from the place's own stored fields - no AI call at
 * posting time. The strong model already wrote `description` once, at
 * intake; re-generating it on every repost would just burn money for no
 * gain (same reasoning the project notes give for WG-Premium being
 * rule-based).
 */
function renderPlacePost(place: Place, neighbors: Place[]) {
  const all = [place, ...neighbors];
  const names = all.map((p) => p.name).join(" & ");
  const slug = slugify(names);

  const shortLines = all.map((p) => `📍 ${p.name}${p.district ? ` (${p.district})` : ""}`);
  const shortText = [
    `Heute-Tipp: ${names}`,
    ...shortLines,
    place.description ?? "",
    `Mehr Infos: ${siteUrl}/orte/${slug}`,
  ]
    .filter(Boolean)
    .join("\n");

  const longText = all
    .map((p) =>
      [`## ${p.name}`, p.description ?? "", p.address ? `Adresse: ${p.address}` : null, p.websiteUrl]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return { title: names, shortText, longText, slug };
}

/**
 * Picks the longest-unused eligible place(s) and turns them into a ready
 * post. Run this twice a day (see jobs/server.ts cron setup).
 */
export async function pickAndPostPlaces(limit = 1): Promise<number> {
  const weather = await getTodayWeather().catch(async (err) => {
    await reportError({
      channelSlug: PLACES_CHANNEL_SLUG,
      step: "places.weather",
      message: `Wetterabfrage fehlgeschlagen, poste ohne Wetterfilter: ${(err as Error).message}`,
    });
    return null;
  });
  const season = currentSeason();

  const candidates = await db
    .select()
    .from(places)
    .where(and(eq(places.channelSlug, PLACES_CHANNEL_SLUG), eq(places.status, "active")))
    // Never-posted places (NULL) count as "longest unused" and must come first.
    .orderBy(sql`${places.lastPostedAt} ASC NULLS FIRST`);

  let posted = 0;
  const usedGroupIds = new Set<string>();

  for (const place of candidates) {
    if (posted >= limit) break;
    if (place.groupId && usedGroupIds.has(place.groupId)) continue; // already posted via its group

    const seasons = place.seasons as string[] | null;
    if (seasons && seasons.length > 0 && !seasons.includes(season)) continue;
    if (place.requiresGoodWeather && weather?.willRain) continue; // rainy day -> skip outdoor-only spots

    const neighbors = place.groupId
      ? await db
          .select()
          .from(places)
          .where(and(eq(places.groupId, place.groupId), eq(places.status, "active")))
          .then((rows) => rows.filter((r) => r.id !== place.id))
      : [];

    const rendered = renderPlacePost(place, neighbors);
    const idsToUpdate = [place.id, ...neighbors.map((n) => n.id)];

    await db.insert(posts).values({
      channelSlug: PLACES_CHANNEL_SLUG,
      title: rendered.title,
      shortText: rendered.shortText,
      longText: rendered.longText,
      sourceLinks: [],
      location: place.address,
      status: "ready",
      websiteSlug: `${rendered.slug}-${place.id.slice(0, 8)}`,
    });

    for (const id of idsToUpdate) {
      await db
        .update(places)
        .set({ lastPostedAt: new Date(), repostCount: (place.repostCount ?? 0) + 1 })
        .where(eq(places.id, id));
    }
    if (place.groupId) usedGroupIds.add(place.groupId);

    posted += 1;
  }

  return posted;
}
