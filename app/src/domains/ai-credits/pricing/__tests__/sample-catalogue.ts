import type { ConversionRates, VendorCosts } from '@/api-client';

import type {
  AiRequestType,
  ChargeOnError,
  ModelModality,
  ModelStatus,
  PricingModel,
  PricingRule,
} from '../types';

/**
 * The product owner's sample from the mockups (`mockups/mock-data.js`), in API
 * shapes: vendor costs and rates as decimal strings, null for an absent rate.
 */

const model = (
  slug: string,
  modality: ModelModality,
  status: ModelStatus,
  costs: Omit<VendorCosts, 'currency'>,
  externalIds: string[] = [],
): PricingModel => ({
  slug,
  modality,
  status,
  externalIds,
  vendorCosts: { currency: 'USD', ...costs },
});

export const MODELS = {
  sonnet: model(
    'claude-sonnet-4-5',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.000003',
      perCachedInputToken: '0.0000003',
      perCacheWriteToken: '0.00000375',
      perOutputToken: '0.000015',
    },
    ['claude-sonnet-4-5-20250929'],
  ),
  haiku: model('claude-haiku-4-5', 'TEXT', 'ACTIVE', {
    perInputToken: '0.000001',
    perCachedInputToken: '0.0000001',
    perCacheWriteToken: '0.00000125',
    perOutputToken: '0.000005',
  }),
  opus: model('claude-opus-4-1', 'TEXT', 'ACTIVE', {
    perInputToken: '0.000015',
    perCachedInputToken: '0.0000015',
    perCacheWriteToken: '0.00001875',
    perOutputToken: '0.000075',
  }),
  gpt5: model('gpt-5', 'MULTIMODAL', 'ACTIVE', {
    perInputToken: '0.00000125',
    perCachedInputToken: '0.000000125',
    perOutputToken: '0.00001',
  }),
  gpt5Mini: model('gpt-5-mini', 'MULTIMODAL', 'ACTIVE', {
    perInputToken: '0.00000025',
    perCachedInputToken: '0.000000025',
    perOutputToken: '0.000002',
  }),
  embeddingSmall: model('text-embedding-3-small', 'EMBEDDING', 'ACTIVE', {
    perInputToken: '0.00000002',
  }),
  gptImage: model('gpt-image-1', 'IMAGE', 'DEPRECATED', { perUnit: '0.04' }),
  transcribe: model('gpt-4o-transcribe', 'AUDIO', 'ACTIVE', {
    perUnit: '0.0001',
  }),
  whisper: model('whisper-large-v3', 'AUDIO', 'ARCHIVED', {
    perUnit: '0.0001',
  }),
  geminiFlash: model('gemini-2-5-flash', 'TEXT', 'ACTIVE', {
    perInputToken: '0.0000003',
    perCachedInputToken: '0.000000075',
    perOutputToken: '0.0000025',
  }),
  geminiPro: model('gemini-2-5-pro', 'TEXT', 'ACTIVE', {
    perInputToken: '0.00000125',
    perCachedInputToken: '0.00000031',
    perOutputToken: '0.00001',
  }),
  geminiFlashLite: model('gemini-2-5-flash-lite', 'TEXT', 'ACTIVE', {
    perInputToken: '0.0000001',
    perCachedInputToken: '0.000000025',
    perOutputToken: '0.0000004',
  }),
  voyage: model('voyage-3', 'EMBEDDING', 'ACTIVE', {
    perInputToken: '0.00000006',
  }),
} as const;

export const CATALOGUE: PricingModel[] = Object.values(MODELS);

const NO_RATES: ConversionRates = {
  perRequest: null,
  perInputToken: null,
  perCachedInputToken: null,
  perCacheWriteToken: null,
  perOutputToken: null,
  perUnit: null,
  perSecond: null,
};

let sequence = 100;

export function rule(
  licenseSlug: string,
  modelSlug: string | null,
  requestType: AiRequestType | null,
  rates: ConversionRates,
  options: {
    min?: string;
    max?: string | null;
    chargeOnError?: ChargeOnError;
    status?: PricingRule['status'];
    updatedAt?: string;
  } = {},
): PricingRule {
  sequence += 1;

  return {
    id: `cr_${sequence}`,
    licenseSlug,
    modelSlug,
    requestType,
    rates: { ...NO_RATES, ...rates },
    minimumCreditsPerRequest: options.min ?? '0',
    maximumCreditsPerRequest: options.max ?? null,
    chargeOnError: options.chargeOnError ?? 'NEVER',
    status: options.status ?? 'ACTIVE',
    updatedAt: options.updatedAt ?? '2026-10-28T14:02:00Z',
  };
}

/** Active rules of the pool `ai-credits` on three current versions. */
export const RULES = {
  'starter-v2': [rule('starter-v2', null, null, { perRequest: '1' })],
  business: [
    rule(
      'business',
      MODELS.sonnet.slug,
      'COMPLETION',
      { perInputToken: '0.0006', perOutputToken: '0.003' },
      { min: '0.01', chargeOnError: 'PROVIDER_ERROR_ONLY' },
    ),
    rule(
      'business',
      MODELS.gpt5Mini.slug,
      'COMPLETION',
      { perInputToken: '0.00004', perOutputToken: '0.0003' },
      { min: '0.01', chargeOnError: 'PROVIDER_ERROR_ONLY' },
    ),
    rule('business', null, 'COMPLETION', { perRequest: '2' }),
  ],
  'enterprise-v2': [
    rule(
      'enterprise-v2',
      MODELS.sonnet.slug,
      'COMPLETION',
      {
        perInputToken: '0.0004',
        perCachedInputToken: '0.00004',
        perCacheWriteToken: '0.0005',
        perOutputToken: '0.002',
      },
      { min: '0.5', max: '250' },
    ),
    rule(
      'enterprise-v2',
      MODELS.gpt5Mini.slug,
      'COMPLETION',
      { perInputToken: '0.00003', perOutputToken: '0.00025' },
      { min: '0.01', chargeOnError: 'PROVIDER_ERROR_ONLY' },
    ),
    rule(
      'enterprise-v2',
      MODELS.geminiFlash.slug,
      null,
      { perRequest: '1.5' },
      { min: '0.01', chargeOnError: 'ALWAYS' },
    ),
    rule(
      'enterprise-v2',
      MODELS.embeddingSmall.slug,
      'EMBEDDING',
      { perInputToken: '0.000003' },
      { min: '0.01', chargeOnError: 'PROVIDER_ERROR_ONLY' },
    ),
    rule('enterprise-v2', MODELS.gptImage.slug, 'IMAGE_GENERATION', {
      perUnit: '5',
    }),
    rule(
      'enterprise-v2',
      MODELS.transcribe.slug,
      'AUDIO',
      { perSecond: '0.02' },
      { min: '0.01' },
    ),
    rule(
      'enterprise-v2',
      null,
      'COMPLETION',
      { perInputToken: '0.0005', perOutputToken: '0.0025' },
      { min: '0.01' },
    ),
  ],
};

/** The `ai-credits` pool's credit value in the mockups, in USD. */
export const CREDIT_VALUE = '0.01';
