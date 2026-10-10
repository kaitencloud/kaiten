import { z } from 'zod';
import type { InvoicePreviewScenario } from '@/api-client';
import { zInvoicePreviewScenario } from '@/api-client/zod.gen';

// A quantity is a non-negative decimal with a point, in the units the entitlement
// measures. A comma is not read as one: "172,345" is read by a person as a
// thousand separator and by a decimal as a fraction, so it is refused rather than
// guessed.
const QUANTITY = /^\d+(?:\.\d+)?$/;

export const isValidQuantity = (text: string) => QUANTITY.test(text.trim());

/**
 * The form of an invoice preview. It starts from the scenario the API takes (the
 * base price and the sample usage), with the base always chosen and the samples
 * kept as typed: one text per entitlement a price meters, empty for no usage.
 */
export const licensePreviewFormSchema = zInvoicePreviewScenario
  .pick({ basePriceId: true })
  .extend({
    basePriceId: z.string(),
    samples: z.record(
      z.string(),
      z
        .string()
        .refine(
          (text) => text.trim() === '' || isValidQuantity(text),
          'Pages.Licenses.Prices.Preview.Errors.quantity',
        ),
    ),
  });

export type LicensePreviewFormValues = z.infer<typeof licensePreviewFormSchema>;

/** The form of a preview before anything is typed: a base, no usage. */
export const initialLicensePreviewValues = (
  basePriceId: string,
  entitlementSlugs: readonly string[],
): LicensePreviewFormValues => ({
  basePriceId,
  samples: Object.fromEntries(entitlementSlugs.map((slug) => [slug, ''])),
});

/**
 * The scenario the API takes. The base is named only when it is not the one the
 * API picks by itself, and an entitlement with nothing typed is left out, which
 * the API reads as no usage.
 */
export function previewValuesToScenario(
  values: LicensePreviewFormValues,
  defaultBasePriceId: string | undefined,
): InvoicePreviewScenario {
  const sampleUsage = Object.entries(values.samples)
    .filter(([, quantity]) => quantity.trim() !== '')
    .map(([entitlementSlug, quantity]) => ({
      entitlementSlug,
      quantity: quantity.trim(),
    }));

  return {
    basePriceId:
      values.basePriceId === defaultBasePriceId
        ? undefined
        : values.basePriceId,
    sampleUsage: sampleUsage.length > 0 ? sampleUsage : undefined,
  };
}
