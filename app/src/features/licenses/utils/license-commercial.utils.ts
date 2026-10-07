import type { License } from '@/api-client';

/**
 * How a license version is sold, beside what it grants: its pricing type, the
 * trial a subscription starts with, whether sign-up captures a payment method,
 * and where a buyer is sent when the version cannot be bought self-serve. They
 * are fields of the version itself, which the API always returns.
 */
export type PricingType = NonNullable<License['pricingType']>;

export const PRICING_TYPES = [
  'FREE',
  'PAID',
  'CUSTOM',
] as const satisfies readonly PricingType[];

// Typed against the contract (`satisfies Record<Enum, string>`), since no check
// reads a key built from a value at run time: a type the API adds fails the type
// check until it reads in both languages.
export const PRICING_TYPE_LABEL_KEYS = {
  FREE: 'Pages.Licenses.Commercial.PricingTypes.FREE',
  PAID: 'Pages.Licenses.Commercial.PricingTypes.PAID',
  CUSTOM: 'Pages.Licenses.Commercial.PricingTypes.CUSTOM',
} as const satisfies Record<PricingType, string>;

// What the API takes of a call-to-action URL: an http(s) address with no
// whitespace in it (`UpdateLicense.InvalidSelfServeCtaUrl`). A link is made of
// nothing else, and the form refuses anything else.
const HTTP_URL = /^https?:\/\/\S+$/;

export const isHttpUrl = (url: string) => HTTP_URL.test(url);

/** What a response omits reads as the API's default on create: sold on request. */
export const getPricingType = (
  license: Pick<License, 'pricingType'>,
): PricingType => license.pricingType ?? 'CUSTOM';

/** The trial of a version: absent when it has none, whether the API sends 0 or nothing. */
export const getTrialPeriodDays = (
  license: Pick<License, 'trialPeriodDays'>,
): number | undefined =>
  license.trialPeriodDays && license.trialPeriodDays > 0
    ? license.trialPeriodDays
    : undefined;
