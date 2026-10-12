import { z } from 'zod';
import type { Addon, NewInstanceAddon } from '@/api-client';
import { zNewInstanceAddon } from '@/api-client/zod.gen';
import { getQuantityProblem } from '../utils/instance-addons.utils';

const ADDON_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Errors.addon';
const QUANTITY_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Errors.quantity';
const QUANTITY_MAX_ERROR_KEY =
  'Pages.Customers.Instances.Detail.Billing.Addons.Attach.Errors.quantityMax';

/**
 * What the dialog that attaches an add-on edits: which version, and how many units.
 * An empty number reads as `NaN`, as it does in every number field of the console,
 * and is a quantity the person has not given.
 */
export const attachAddonFormSchema = zNewInstanceAddon
  .pick({ addonSlug: true })
  .extend({
    addonSlug: zNewInstanceAddon.shape.addonSlug.min(1, ADDON_ERROR_KEY),
    quantity: z.custom<number>(
      (quantity) =>
        typeof quantity === 'number' &&
        Number.isInteger(quantity) &&
        quantity >= 1,
      { error: QUANTITY_ERROR_KEY },
    ),
  });

export type AttachAddonFormValues = z.infer<typeof attachAddonFormSchema>;

export const initialAttachAddonFormValues: AttachAddonFormValues = {
  addonSlug: '',
  quantity: 1,
};

export type AttachAddonFormErrors = Partial<
  Record<keyof AttachAddonFormValues, string>
>;

/**
 * What is wrong with the form, field by field, or nothing. Beyond the schema, a
 * quantity is bounded by the version chosen, which the form alone knows: the API
 * refuses a quantity above the most a version allows, and this tells the person
 * before they ask.
 */
export function getAttachAddonFormErrors(
  values: AttachAddonFormValues,
  addon: Pick<Addon, 'maxQuantity'> | undefined,
): AttachAddonFormErrors | undefined {
  const errors: AttachAddonFormErrors = {};
  const result = attachAddonFormSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in errors)) {
        errors[field as keyof AttachAddonFormValues] = issue.message;
      }
    }
  }
  if (
    !errors.quantity &&
    addon &&
    getQuantityProblem(values.quantity, addon) === 'max'
  ) {
    errors.quantity = QUANTITY_MAX_ERROR_KEY;
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

export function attachValuesToBody(
  values: AttachAddonFormValues,
): NewInstanceAddon {
  return { addonSlug: values.addonSlug, quantity: values.quantity };
}

/**
 * Where a refusal of the API is shown on the form. The API names the field in prose
 * and does not locate it, so the code says which it is, and the message goes on that
 * field, where the person is looking. The refusals that are about the subscription
 * (a period being closed, the billing of the instance) are about no field and are
 * shown above the buttons.
 */
export const ATTACH_ADDON_REFUSAL_FIELDS = {
  byCode: {
    'AttachInstanceAddon.AddonArchived': 'addonSlug',
    'AttachInstanceAddon.AddonNotFound': 'addonSlug',
    'AttachInstanceAddon.AddonNotPublished': 'addonSlug',
    'AttachInstanceAddon.CurrencyMismatch': 'addonSlug',
    'AttachInstanceAddon.FamilyAlreadyAttached': 'addonSlug',
    'AttachInstanceAddon.Incompatible': 'addonSlug',
    'AttachInstanceAddon.IncompatibleWithScheduledPlan': 'addonSlug',
    'AttachInstanceAddon.InvalidQuantity': 'quantity',
    'AttachInstanceAddon.MeteredEntitlementConflict': 'addonSlug',
    'AttachInstanceAddon.NoPriceForBillingPeriod': 'addonSlug',
    'AttachInstanceAddon.QuantityExceedsMax': 'quantity',
  },
  byLocation: { addonSlug: 'addonSlug', quantity: 'quantity' },
} as const;
