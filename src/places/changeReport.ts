import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { placeChangeReports, places } from "../db/schema.js";

/**
 * "Melde eine Änderung" form (project notes): flips the place back to
 * needs_review immediately, so it stops getting posted until a human
 * confirms whether the reported change is real.
 */
export async function submitPlaceChangeReport(params: {
  placeId: string;
  message: string;
  reporterContact?: string;
}) {
  const [report] = await db
    .insert(placeChangeReports)
    .values({
      placeId: params.placeId,
      message: params.message,
      reporterContact: params.reporterContact,
    })
    .returning();

  await db.update(places).set({ status: "needs_review" }).where(eq(places.id, params.placeId));

  return report!;
}
