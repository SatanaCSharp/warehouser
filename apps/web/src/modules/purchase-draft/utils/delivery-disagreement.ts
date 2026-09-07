import { z } from 'zod';

/**
 * One entry of `purchase_drafts.delivery_address_disagreement`'s
 * `details.disagreeingLinks` (AC-15a) — `purchase-draft.errors.ts`
 * `DisagreeingDeliveryLink`, read back on the web side. Only the identifiers
 * travel; the customer name each bullet reads is resolved from the line the
 * refusal was raised against, exactly as `EndingRefusalAlert` resolves its
 * own bounds.
 */
const disagreeingDeliveryLinkSchema = z.object({
  purchaseDraftLineLinkId: z.string(),
  customerOrderId: z.string(),
  lineDeliveryAddressId: z.string(),
  customerOrderDeliveryAddressId: z.string().nullable(),
});

export type DisagreeingDeliveryLink = z.infer<
  typeof disagreeingDeliveryLinkSchema
>;

// A link this build cannot parse is dropped rather than failing the whole list, so a server that
// grows the envelope still explains the links it can read.
const disagreementDetailsSchema = z.object({
  disagreeingLinks: z.array(
    disagreeingDeliveryLinkSchema.nullable().catch(null),
  ),
});

/**
 * Every disagreeing link one AC-15a refusal reports, or none when the
 * refusal carried no breakdown this build can read.
 */
export const disagreeingDeliveryLinks = (
  details: Record<string, unknown> | undefined,
): DisagreeingDeliveryLink[] => {
  const parsed = disagreementDetailsSchema.safeParse(details);

  return parsed.success
    ? parsed.data.disagreeingLinks.flatMap((link) =>
        link === null ? [] : [link],
      )
    : [];
};
