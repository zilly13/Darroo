import { z } from "zod";

export const newListingFormSchema = z.object({
  channelSlug: z.string(), // e.g. "immobilien-muenchen"
  listingType: z.enum(["immobilie", "job", "gebrauchtwagen"]),
  title: z.string().min(3),
  description: z.string().min(10),
  priceCents: z.number().int().nonnegative().optional(),
  contactName: z.string(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
});
export type NewListingForm = z.infer<typeof newListingFormSchema>;
