import { z } from 'zod';
import type { Addon, AddonChanges, NewAddon } from '@/api-client';
import { zNewAddon } from '@/api-client/zod.gen';

/** The largest quantity the API takes: an int32. */
const MAX_QUANTITY_LIMIT = 2_147_483_647;

/**
 * The form of an add-on version: the fields of the API's body for a new one, as
 * the form holds them. An empty text is nothing chosen (the API names the slug and
 * the version, and leaves the quantity unbounded), and an empty number is `NaN`, as
 * it is in every number field of the console. The one field the body does not have
 * is `createAsDraft`.
 */
export const addonFormSchema = zNewAddon
  .pick({ description: true, name: true, pricingType: true })
  .extend({
    // A version is bought by its quantity: whole, from one up. Empty is unbounded.
    maxQuantity: z.custom<number>(
      (quantity) =>
        typeof quantity === 'number' &&
        (Number.isNaN(quantity) ||
          (Number.isInteger(quantity) &&
            quantity >= 1 &&
            quantity <= MAX_QUANTITY_LIMIT)),
      { error: 'Pages.Addons.Form.Errors.maxQuantity' },
    ),
    // Not the contract's own rule with another message on top: its first failure would
    // be the one the person reads, in the words of the validator and not ours.
    name: z.string().min(1, 'Pages.Addons.Form.Errors.name'),
    // Left empty, the API names the version: its slug from the name of a new family,
    // `{family}-v{n}` for a new version of one.
    slug: z.string(),
    // Left empty, the API calls it "Version - {n}".
    versionName: z.string(),
    // A draft is not on sale yet: it can be given its entitlements, its prices and the
    // licenses it fits before it is, and the API freezes them once an instance with a
    // live subscription holds it.
    createAsDraft: z.boolean(),
  });

export type AddonFormValues = z.infer<typeof addonFormSchema>;

/** What a new version starts as: a draft, priced, unbounded. */
export const initialAddonFormValues = (
  base?: Pick<Addon, 'name' | 'pricingType'>,
): AddonFormValues => ({
  createAsDraft: true,
  description: '',
  maxQuantity: Number.NaN,
  name: base?.name ?? '',
  pricingType: base?.pricingType ?? 'PAID',
  slug: '',
  versionName: '',
});

/** The values of the form of an existing version. */
export const addonToFormValues = (addon: Addon): AddonFormValues => ({
  createAsDraft: false,
  description: addon.description,
  maxQuantity: addon.maxQuantity ?? Number.NaN,
  name: addon.name,
  pricingType: addon.pricingType,
  slug: addon.slug,
  versionName: addon.versionName,
});

const toOptionalText = (text: string): string | undefined =>
  text.trim() === '' ? undefined : text.trim();

const toOptionalQuantity = (quantity: number): number | undefined =>
  Number.isNaN(quantity) ? undefined : quantity;

/**
 * The body of a new version. `familySlug` makes it the next version of a family: the
 * API copies nothing from the previous one. It is created as a draft unless the
 * person says otherwise, and the slug is the API's to make when it is left empty.
 */
export function addonFormValuesToCreateBody(
  values: AddonFormValues,
  { familySlug }: { familySlug?: string } = {},
): NewAddon {
  return {
    description: values.description,
    familySlug,
    lifecycleState: values.createAsDraft ? 'DRAFT' : 'PUBLISHED',
    maxQuantity: toOptionalQuantity(values.maxQuantity),
    name: values.name.trim(),
    pricingType: values.pricingType,
    slug: familySlug ? undefined : toOptionalText(values.slug),
    versionName: toOptionalText(values.versionName),
  };
}

/**
 * The body of an update. The API replaces what the version has -- a member left out
 * is cleared, the name of the version to its default and the quantity to unbounded --
 * so everything is sent, with the default flag as it is. It is moved by the action
 * of the row, which sends the rest as it stands (`addonToChangesBody`).
 */
export function addonFormValuesToUpdateBody(
  values: AddonFormValues,
  addon: Pick<Addon, 'isDefault'>,
): AddonChanges {
  return {
    description: values.description,
    isDefault: addon.isDefault,
    maxQuantity: toOptionalQuantity(values.maxQuantity),
    name: values.name.trim(),
    versionName: toOptionalText(values.versionName),
  };
}

/** The body that restates a version as it is, with the default flag set as asked. */
export function addonToChangesBody(
  addon: Pick<Addon, 'description' | 'maxQuantity' | 'name' | 'versionName'>,
  isDefault: boolean,
): AddonChanges {
  return {
    description: addon.description,
    isDefault,
    maxQuantity: addon.maxQuantity,
    name: addon.name,
    versionName: addon.versionName,
  };
}
