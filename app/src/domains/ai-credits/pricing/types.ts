import type {
  AiInference,
  AiInferencePricing,
  AiUsageValue,
  ConversionRates,
  ConversionRule,
  Model,
} from '@/api-client';

/**
 * The pricing engine's vocabulary, derived from the generated API types. Names
 * follow the Go package `api/internal/modules/instances/usage/aicredit`, which
 * the server applies.
 */

export type AiRequestType = AiInference['requestType'];

export type AiRequestStatus = NonNullable<AiUsageValue['requestStatus']>;

export type ChargeOnError = ConversionRule['chargeOnError'];

export type ModelStatus = Model['status'];

export type ModelModality = Model['modality'];

export type RateKey = keyof ConversionRates;

/** The four ladder levels, most specific first (Go `Specificity`). */
export type Specificity = 'EXACT_TYPED' | 'EXACT_ALL' | 'ANY_TYPED' | 'ANY_ALL';

export const SPECIFICITIES: readonly Specificity[] = [
  'EXACT_TYPED',
  'EXACT_ALL',
  'ANY_TYPED',
  'ANY_ALL',
];

/** Why a call is not authorized, as the server stores it on the inference. */
export type DenialReason = 'UNKNOWN_MODEL' | 'MODEL_ARCHIVED' | 'NO_RULE';

/** The seven priced dimensions, in the order the server adds them. */
export type PricingDimension =
  | 'REQUEST'
  | 'INPUT_TOKEN'
  | 'CACHE_READ_TOKEN'
  | 'CACHE_WRITE_TOKEN'
  | 'OUTPUT_TOKEN'
  | 'UNIT'
  | 'SECOND';

export const PRICING_DIMENSIONS: readonly PricingDimension[] = [
  'REQUEST',
  'INPUT_TOKEN',
  'CACHE_READ_TOKEN',
  'CACHE_WRITE_TOKEN',
  'OUTPUT_TOKEN',
  'UNIT',
  'SECOND',
];

/** The rate of each dimension in a rule's vector. */
export const RATE_KEY_OF: Readonly<Record<PricingDimension, RateKey>> = {
  REQUEST: 'perRequest',
  INPUT_TOKEN: 'perInputToken',
  CACHE_READ_TOKEN: 'perCachedInputToken',
  CACHE_WRITE_TOKEN: 'perCacheWriteToken',
  OUTPUT_TOKEN: 'perOutputToken',
  UNIT: 'perUnit',
  SECOND: 'perSecond',
};

/** What prices a usage: a rule's vector, bounds and policy. */
export type PricingTerms = Pick<
  ConversionRule,
  | 'rates'
  | 'minimumCreditsPerRequest'
  | 'maximumCreditsPerRequest'
  | 'chargeOnError'
>;

/** A rule as resolution needs it; REST `ConversionRule` and GraphQL rows fit. */
export type PricingRule = PricingTerms &
  Pick<ConversionRule, 'id' | 'modelSlug' | 'requestType' | 'status'> &
  Partial<Pick<ConversionRule, 'updatedAt' | 'licenseSlug'>>;

/** A catalogue model as resolution and vendor cost need it. */
export type PricingModel = Pick<Model, 'slug' | 'status'> &
  Partial<Pick<Model, 'externalIds' | 'modality' | 'vendorCosts'>>;

/** The rates the server applied at commit, stored on the inference (`pricing`). */
export type PricingSnapshot = AiInferencePricing;

/** An inference row; its `pricing` snapshot is absent on rows older than snapshots. */
export type AiInferenceWithSnapshot = AiInference;
