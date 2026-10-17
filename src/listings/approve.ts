import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { listings, posts } from "../db/schema.js";
import { writePost } from "../ai/prompts/write.js";

const siteUrl = process.env.PUBLIC_SITE_URL ?? "https://darroo.com";
const DEFAULT_LISTING_DAYS = 30;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * The short human approval step the project notes ask for ("kurze Freigabe
 * bei Inseraten"): a reviewer calls this only after payment is confirmed
 * (listing.status === "pending_review") and after skimming the stored
 * fraud-check score. This is the one listings step worth the strong model -
 * it's revenue-generating, customer-facing text.
 */
export async function approveListing(listingId: string) {
  const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
  if (!listing) throw new Error(`Listing ${listingId} not found`);
  if (listing.status !== "pending_review") {
    throw new Error(`Listing ${listingId} is "${listing.status}", expected "pending_review"`);
  }

  const written = await writePost({
    channelTopic: `Bezahltes Inserat (${listing.listingType}) für den darroo-Kanal ${listing.channelSlug}`,
    title: listing.title,
    sources: [{ name: "Inserent", url: "", excerpt: listing.description }],
    siteUrl,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DEFAULT_LISTING_DAYS);

  await db
    .update(listings)
    .set({ status: "approved", shortText: written.shortText, longText: written.longText, expiresAt })
    .where(eq(listings.id, listingId));

  await db.insert(posts).values({
    channelSlug: listing.channelSlug,
    title: written.title,
    shortText: written.shortText,
    longText: written.longText,
    sourceLinks: [],
    status: "ready",
    websiteSlug: `${slugify(written.title)}-${listing.id.slice(0, 8)}`,
  });
}
