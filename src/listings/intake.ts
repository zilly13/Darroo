import { db } from "../db/client.js";
import { listings } from "../db/schema.js";
import { checkListingForFraud } from "../ai/prompts/fraudCheck.js";
import { contentFingerprint } from "../utils/hash.js";
import { reportError } from "../notify/index.js";
import type { NewListingForm } from "./types.js";

/**
 * "Nur bezahlte Inserate über ein Formular" + fraud pre-check (project
 * notes): every submission is fingerprinted (freshness/duplicate filter,
 * same idea as the content pipeline) and immediately scored for fraud
 * patterns, so a human reviewer already has that signal once payment
 * confirms. Starts in "pending_payment" - nothing gets published before
 * money has actually moved.
 */
export async function createListingFromForm(form: NewListingForm) {
  const fingerprint = contentFingerprint({ title: form.title, location: null });

  const fraud = await checkListingForFraud({
    listingType: form.listingType,
    title: form.title,
    description: form.description,
    priceLabel: form.priceCents ? `${(form.priceCents / 100).toFixed(2)} EUR` : undefined,
    contactEmail: form.contactEmail,
  }).catch(async (err) => {
    await reportError({
      channelSlug: form.channelSlug,
      step: "listings.fraudCheck",
      message: `Betrugs-Check fehlgeschlagen, Inserat geht trotzdem in die Review-Queue: ${(err as Error).message}`,
    });
    return null;
  });

  const [created] = await db
    .insert(listings)
    .values({
      channelSlug: form.channelSlug,
      listingType: form.listingType,
      title: form.title,
      description: form.description,
      priceCents: form.priceCents,
      contact: { name: form.contactName, email: form.contactEmail, phone: form.contactPhone },
      contentHash: fingerprint,
      fraudCheck: fraud,
      status: "pending_payment",
    })
    .onConflictDoNothing({ target: [listings.channelSlug, listings.contentHash] })
    .returning();

  if (!created) {
    throw new Error("Dieses Inserat wurde bereits eingereicht (gleicher Titel).");
  }
  return created;
}
