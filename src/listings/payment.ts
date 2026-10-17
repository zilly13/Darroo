import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { listings } from "../db/schema.js";

/**
 * Call this from whatever payment confirmation you wire up (Stripe webhook,
 * bank transfer check, ...). Deliberately not opinionated about the payment
 * provider - that choice doesn't belong in this project's core pipeline.
 */
export async function markListingPaid(listingId: string) {
  const [updated] = await db
    .update(listings)
    .set({ paymentStatus: "paid", status: "pending_review" })
    .where(eq(listings.id, listingId))
    .returning();
  return updated;
}
