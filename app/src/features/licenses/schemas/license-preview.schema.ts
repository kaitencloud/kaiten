import { z } from 'zod';
import type { InvoicePreviewScenario } from '@/api-client';
import { zAddonAmount, zInvoicePreviewScenario } from '@/api-client/zod.gen';

// A quantity is a non-negative decimal with a point, in the units the entitlement
// measures. A comma is not read as one: "172,345" is read by a person as a
// thousand separator and by a decimal as a fraction, so it is refused rather than
// guessed.
const QUANTITY = /^\d+(?:\.\d+)?$/;

export const isValidQuantity = (text: string) => QUANTITY.test(text.trim());

/**
 * Where the usage the invoice is rated from comes from: a sample typed for each
 * entitlement, or the journal of an instance. The API takes one of the two, so the form
 * offers one at a time and sends the one it is on.
 */
export const PREVIEW_USAGE_SOURCES = ['samples', 'instance'] as const;
export type PreviewUsageSource = (typeof PREVIEW_USAGE_SOURCES)[number];

/**
 * An add-on priced in, as a row of the list: the version and the units. A row is kept by
 * a key of its own, so that removing one leaves the others as they are. An empty
 * number reads as `NaN`, as it does in every number field of the console, and a
 * fraction is no number of units: the contract would refuse both in its own words,
 * so the form says it in its own, and leaves the bounds to the contract.
 */
const addOnRowSchema = zAddonAmount.extend({
  addonSlug: zAddonAmount.shape.addonSlug.min(
    1,
    'Pages.Licenses.Prices.Preview.Errors.addon',
  ),
  key: z.string(),
  quantity: z
    .custom<number>(
      (units) => typeof units === 'number' && Number.isInteger(units),
      { error: 'Pages.Licenses.Prices.Preview.Errors.addonQuantity' },
    )
    .pipe(
      zAddonAmount.shape.quantity.min(
        1,
        'Pages.Licenses.Prices.Preview.Errors.addonQuantity',
      ),
    ),
});

export type PreviewAddOnRow = z.infer<typeof addOnRowSchema>;

let addOnCount = 0;

/** A row for an add-on nobody chose yet: one unit of nothing. */
export function newPreviewAddOn(): PreviewAddOnRow {
  addOnCount += 1;

  return { addonSlug: '', key: `add-on-${addOnCount}`, quantity: 1 };
}

/**
 * The form of an invoice preview. It starts from the scenario the API takes: the base
 * price, always chosen; the usage, from samples kept as typed (one text per entitlement
 * a price meters, empty for no usage) or from an instance, never both; the add-ons priced
 * in, with their units; and the code of a voucher, empty for none.
 */
export const licensePreviewFormSchema = zInvoicePreviewScenario
  .pick({ basePriceId: true })
  .extend({
    addOns: z.array(addOnRowSchema),
    basePriceId: z.string(),
    instanceSlug: zInvoicePreviewScenario.shape.instanceSlug.unwrap(),
    samples: z.record(
      z.string(),
      z
        .string()
        .refine(
          (text) => text.trim() === '' || isValidQuantity(text),
          'Pages.Licenses.Prices.Preview.Errors.quantity',
        ),
    ),
    usageSource: z.enum(PREVIEW_USAGE_SOURCES),
    // The code is checked by the API alone: whether it exists and whether it is an active
    // voucher of prices are its to say, and it says which, in words.
    voucherCode: zInvoicePreviewScenario.shape.voucherCode.unwrap(),
  })
  .refine(
    (values) => values.usageSource !== 'instance' || values.instanceSlug !== '',
    {
      error: 'Pages.Licenses.Prices.Preview.Errors.instance',
      path: ['instanceSlug'],
    },
  );

export type LicensePreviewFormValues = z.infer<typeof licensePreviewFormSchema>;

/** The form of a preview before anything is typed: a base, sample usage, nothing priced in. */
export const initialLicensePreviewValues = (
  basePriceId: string,
  entitlementSlugs: readonly string[],
): LicensePreviewFormValues => ({
  addOns: [],
  basePriceId,
  instanceSlug: '',
  samples: Object.fromEntries(entitlementSlugs.map((slug) => [slug, ''])),
  usageSource: 'samples',
  voucherCode: '',
});

type ScenarioOptions = {
  /** The base the API picks when none is named. */
  defaultBasePriceId?: string;
  /**
   * The entitlements a sample may be given for now: those a price of the version rates and
   * those a price of an add-on in the list does. A sample typed for the meter of an add-on
   * that was taken off the list since is left out. Left out, every sample typed is sent.
   */
  meterSlugs?: readonly string[];
};

/**
 * The scenario the API takes. The base is named only when it is not the one the
 * API picks by itself, and an entitlement with nothing typed is left out, which
 * the API reads as no usage. The usage of an instance and the samples are never sent
 * together: only the source the form is on is. The code of a voucher is trimmed, and
 * left out when empty.
 */
export function previewValuesToScenario(
  values: LicensePreviewFormValues,
  { defaultBasePriceId, meterSlugs }: ScenarioOptions = {},
): InvoicePreviewScenario {
  const fromInstance = values.usageSource === 'instance';
  const sampleUsage = fromInstance
    ? []
    : Object.entries(values.samples)
        .filter(
          ([entitlementSlug, quantity]) =>
            quantity.trim() !== '' &&
            (meterSlugs === undefined || meterSlugs.includes(entitlementSlug)),
        )
        .map(([entitlementSlug, quantity]) => ({
          entitlementSlug,
          quantity: quantity.trim(),
        }));
  const voucherCode = values.voucherCode.trim();

  return {
    addOns:
      values.addOns.length > 0
        ? values.addOns.map(({ addonSlug, quantity }) => ({
            addonSlug,
            quantity,
          }))
        : undefined,
    basePriceId:
      values.basePriceId === defaultBasePriceId
        ? undefined
        : values.basePriceId,
    instanceSlug: fromInstance ? values.instanceSlug : undefined,
    sampleUsage: sampleUsage.length > 0 ? sampleUsage : undefined,
    voucherCode: voucherCode === '' ? undefined : voucherCode,
  };
}
