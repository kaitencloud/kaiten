import type { Voucher } from '@/api-client';
import type { VersionLifecycleKeys } from '@/domains/billing';

// The keys of the labels the screens of the vouchers write out, in full, so that a key
// that does not exist fails the check of the keys.

export const DURATION_LABEL_KEYS = {
  FOREVER: 'Pages.Vouchers.Wizard.Duration.FOREVER',
  ONE_TIME: 'Pages.Vouchers.Wizard.Duration.ONE_TIME',
  REPEATING: 'Pages.Vouchers.Wizard.Duration.REPEATING',
} as const satisfies Record<Voucher['duration'], string>;

/** What a duration counts: invoices for a discount, billing periods for a boost. */
export const DURATION_BLURB_KEYS = {
  ENTITLEMENT_BOOST: {
    FOREVER: 'Pages.Vouchers.Wizard.Duration.Blurb.boostFOREVER',
    ONE_TIME: 'Pages.Vouchers.Wizard.Duration.Blurb.boostONE_TIME',
    REPEATING: 'Pages.Vouchers.Wizard.Duration.Blurb.boostREPEATING',
  },
  PRICE: {
    FOREVER: 'Pages.Vouchers.Wizard.Duration.Blurb.priceFOREVER',
    ONE_TIME: 'Pages.Vouchers.Wizard.Duration.Blurb.priceONE_TIME',
    REPEATING: 'Pages.Vouchers.Wizard.Duration.Blurb.priceREPEATING',
  },
} as const satisfies Record<
  Voucher['voucherType'],
  Record<Voucher['duration'], string>
>;

export const APPLIES_TO_LABEL_KEYS = {
  ADDONS: 'Pages.Vouchers.Wizard.AppliesTo.ADDONS',
  BOTH: 'Pages.Vouchers.Wizard.AppliesTo.BOTH',
  LICENSE_BASE: 'Pages.Vouchers.Wizard.AppliesTo.LICENSE_BASE',
  SELECTED_PRICES: 'Pages.Vouchers.Wizard.AppliesTo.SELECTED_PRICES',
} as const satisfies Record<NonNullable<Voucher['priceAppliesTo']>, string>;

export const APPLIES_TO_BLURB_KEYS = {
  ADDONS: 'Pages.Vouchers.Wizard.AppliesTo.Blurb.ADDONS',
  BOTH: 'Pages.Vouchers.Wizard.AppliesTo.Blurb.BOTH',
  LICENSE_BASE: 'Pages.Vouchers.Wizard.AppliesTo.Blurb.LICENSE_BASE',
  SELECTED_PRICES: 'Pages.Vouchers.Wizard.AppliesTo.Blurb.SELECTED_PRICES',
} as const satisfies Record<NonNullable<Voucher['priceAppliesTo']>, string>;

export const DISCOUNT_TYPE_LABEL_KEYS = {
  FIXED_AMOUNT: 'Pages.Vouchers.Wizard.DiscountType.FIXED_AMOUNT',
  PERCENTAGE: 'Pages.Vouchers.Wizard.DiscountType.PERCENTAGE',
} as const satisfies Record<NonNullable<Voucher['priceDiscountType']>, string>;

export const MODIFIER_LABEL_KEYS = {
  ADD: 'Pages.Vouchers.Wizard.Modifier.ADD',
  MULTIPLY: 'Pages.Vouchers.Wizard.Modifier.MULTIPLY',
  SET: 'Pages.Vouchers.Wizard.Modifier.SET',
  UNLIMITED: 'Pages.Vouchers.Wizard.Modifier.UNLIMITED',
} as const satisfies Record<
  NonNullable<Voucher['grants']>[number]['modifierType'],
  string
>;

/** The types a voucher could be, and the two V1 ships; the others are shown and cannot be chosen. */
export const LATER_VOUCHER_TYPES = ['FLAG_GRANT', 'COMPOSITE'] as const;

/** How long an offer lasts, in the order the form offers them. */
export const VOUCHER_DURATIONS = [
  'ONE_TIME',
  'REPEATING',
  'FOREVER',
] as const satisfies readonly Voucher['duration'][];

/** What a discount applies to, in the order the form offers them. */
export const APPLIES_TO_OPTIONS = [
  'LICENSE_BASE',
  'ADDONS',
  'BOTH',
  'SELECTED_PRICES',
] as const satisfies readonly NonNullable<Voucher['priceAppliesTo']>[];

/** How a discount is worked out, in the order the form offers them. */
export const DISCOUNT_TYPES = [
  'PERCENTAGE',
  'FIXED_AMOUNT',
] as const satisfies readonly NonNullable<Voucher['priceDiscountType']>[];

/**
 * The words of the two transitions a voucher goes through: a draft is published, and a
 * voucher that is not archived can be. Nothing puts an archived voucher back.
 */
export const VOUCHER_TRANSITION_KEYS = {
  archive: {
    confirm: 'Pages.Vouchers.Actions.archive.confirm',
    description: 'Pages.Vouchers.Actions.archive.description',
    label: 'Pages.Vouchers.Actions.archive.label',
    title: 'Pages.Vouchers.Actions.archive.title',
  },
  publish: {
    confirm: 'Pages.Vouchers.Actions.publish.confirm',
    description: 'Pages.Vouchers.Actions.publish.description',
    label: 'Pages.Vouchers.Actions.publish.label',
    title: 'Pages.Vouchers.Actions.publish.title',
  },
} as const satisfies VersionLifecycleKeys<'archive' | 'publish'>;
