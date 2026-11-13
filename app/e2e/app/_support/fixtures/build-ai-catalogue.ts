import type {
  ConversionRates,
  ConversionRule,
  Entitlement,
  License,
  LicenseEntitlement,
  Model,
  VendorCosts,
} from '@/api-client';
import { TEST_USER } from './build-customer';

/**
 * The AI credits catalogue the mocks share: the models with their vendor costs,
 * the credit pools, what each licence version grants of them and the conversion
 * rules that price the models. The figures are those of the AI control plane
 * mockups (`mock-data.js`), so that screens, tests and mockups agree. All
 * synthetic.
 *
 * Licence versions are named by slug: the dev world's and the scenarios'
 * catalogues both carry `trial`, `starter`, `starter-v2`, `starter-v3`,
 * `business`, `enterprise` and `enterprise-v2`.
 */

const CREATED_AT = '2026-09-02T10:00:00.000Z';
const RULES_UPDATED_AT = '2026-10-28T14:02:00.000Z';

export const AI_POOL = 'ai-credits';
export const PARTNER_POOL = 'partner-ai-credits';
export const EMPTY_POOL = 'agent-credits';

const model = (
  slug: string,
  name: string,
  vendor: string,
  modality: Model['modality'],
  status: Model['status'],
  costs: Omit<VendorCosts, 'currency'>,
  externalIds: string[] = [],
): Model => ({
  createdAt: CREATED_AT,
  externalIds,
  id: `model-${slug}`,
  modality,
  name,
  slug,
  status,
  updatedAt: CREATED_AT,
  vendor,
  vendorCosts: { currency: 'USD', ...costs },
});

/** Thirteen models across five vendors: one deprecated, one archived. */
export const buildAiModels = (): Model[] => [
  model(
    'claude-sonnet-4-5',
    'Claude Sonnet 4.5',
    'Anthropic',
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
  model(
    'claude-haiku-4-5',
    'Claude Haiku 4.5',
    'Anthropic',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.000001',
      perCachedInputToken: '0.0000001',
      perCacheWriteToken: '0.00000125',
      perOutputToken: '0.000005',
    },
    ['claude-haiku-4-5-20251001'],
  ),
  model(
    'claude-opus-4-1',
    'Claude Opus 4.1',
    'Anthropic',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.000015',
      perCachedInputToken: '0.0000015',
      perCacheWriteToken: '0.00001875',
      perOutputToken: '0.000075',
    },
    ['claude-opus-4-1-20250805'],
  ),
  model(
    'gpt-5',
    'GPT-5',
    'OpenAI',
    'MULTIMODAL',
    'ACTIVE',
    {
      perInputToken: '0.00000125',
      perCachedInputToken: '0.000000125',
      perOutputToken: '0.00001',
    },
    ['gpt-5-2025-08-07'],
  ),
  model('gpt-5-mini', 'GPT-5 mini', 'OpenAI', 'MULTIMODAL', 'ACTIVE', {
    perInputToken: '0.00000025',
    perCachedInputToken: '0.000000025',
    perOutputToken: '0.000002',
  }),
  model(
    'text-embedding-3-small',
    'Text Embedding 3 Small',
    'OpenAI',
    'EMBEDDING',
    'ACTIVE',
    { perInputToken: '0.00000002' },
  ),
  model('gpt-image-1', 'GPT Image 1', 'OpenAI', 'IMAGE', 'DEPRECATED', {
    perUnit: '0.04',
  }),
  model('gpt-4o-transcribe', 'GPT-4o Transcribe', 'OpenAI', 'AUDIO', 'ACTIVE', {
    perUnit: '0.0001',
  }),
  model('whisper-large-v3', 'Whisper large v3', 'OpenAI', 'AUDIO', 'ARCHIVED', {
    perUnit: '0.0001',
  }),
  model(
    'gemini-2-5-flash',
    'Gemini 2.5 Flash',
    'Google',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.0000003',
      perCachedInputToken: '0.000000075',
      perOutputToken: '0.0000025',
    },
    ['gemini-2.5-flash'],
  ),
  model(
    'gemini-2-5-pro',
    'Gemini 2.5 Pro',
    'Google',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.00000125',
      perCachedInputToken: '0.00000031',
      perOutputToken: '0.00001',
    },
    ['gemini-2.5-pro'],
  ),
  model(
    'gemini-2-5-flash-lite',
    'Gemini 2.5 Flash-Lite',
    'Google',
    'TEXT',
    'ACTIVE',
    {
      perInputToken: '0.0000001',
      perCachedInputToken: '0.000000025',
      perOutputToken: '0.0000004',
    },
    ['gemini-2.5-flash-lite'],
  ),
  model('voyage-3', 'Voyage 3', 'Voyage AI', 'EMBEDDING', 'ACTIVE', {
    perInputToken: '0.00000006',
  }),
];

const pool = (
  slug: string,
  name: string,
  description: string,
  displayOrder: number,
  warningThresholdPercent: number,
): Entitlement => ({
  aggregationMethod: 'SUM',
  createdAt: '2026-09-01T09:00:00.000Z',
  description,
  displayOrder,
  id: `entitlement-${slug}`,
  name,
  resetAnchor: 'CALENDAR',
  resetPeriod: 'MONTH',
  slug,
  type: 'NUMBER_AI_CREDIT',
  unitPlural: 'credits',
  unitSingular: 'credit',
  updatedAt: '2026-09-01T09:00:00.000Z',
  warningThresholdPercent,
});

/**
 * Three pools: the shared one, a partner pool granted by one version only, and
 * an empty one that no version grants and no rule prices.
 */
export const buildAiPools = (): Entitlement[] => [
  pool(
    AI_POOL,
    'AI credits',
    'Shared pool of AI credits, spent per request.',
    20,
    80,
  ),
  pool(
    PARTNER_POOL,
    'Partner AI credits',
    'Credits for partner integrations.',
    21,
    90,
  ),
  pool(
    EMPTY_POOL,
    'Agent credits',
    'Credits for the support agent beta.',
    22,
    0,
  ),
];

/**
 * What each version grants of the pools: [limit, overage percent]. `trial`
 * grants the shared pool and no rule prices it there, so every call on it is
 * refused with `NO_RULE`.
 */
export const AI_GRANTS: Record<string, Record<string, [number, number]>> = {
  trial: { [AI_POOL]: [100, 0] },
  starter: { [AI_POOL]: [300, 0] },
  'starter-v2': { [AI_POOL]: [500, 0] },
  'starter-v3': { [AI_POOL]: [1_000, 0] },
  business: { [AI_POOL]: [5_000, 10] },
  enterprise: { [AI_POOL]: [100_000, 10] },
  'enterprise-v2': { [AI_POOL]: [250_000, 10], [PARTNER_POOL]: [20_000, 10] },
};

/** The grants of the pools on the versions of `licenses` that the table names. */
export const buildAiGrants = (
  licenses: readonly License[],
  pools: readonly Entitlement[],
): LicenseEntitlement[] =>
  licenses.flatMap((license) =>
    pools.flatMap((entitlement): LicenseEntitlement[] => {
      const grant = AI_GRANTS[license.slug ?? '']?.[entitlement.slug ?? ''];
      if (!grant) return [];
      const [value, overagePercent] = grant;
      return [
        {
          createdAt: license.createdAt,
          createdBy: TEST_USER,
          entitlementName: entitlement.name,
          entitlementSlug: entitlement.slug ?? '',
          entitlementType: 'NUMBER_AI_CREDIT',
          licenseId: license.id,
          licenseSlug: license.slug ?? license.id,
          limitCapExceededOveragePercent: overagePercent,
          updatedAt: license.createdAt,
          updatedBy: TEST_USER,
          value: { type: 'number', value },
        },
      ];
    }),
  );

/** A UUID the API would accept, numbered so a spec can name it. */
export const aiRuleId = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

type RuleSpec = [
  license: string,
  pool: string,
  modelSlug: string | null,
  requestType: ConversionRule['requestType'],
  rates: ConversionRates,
  options?: Partial<
    Pick<
      ConversionRule,
      | 'chargeOnError'
      | 'maximumCreditsPerRequest'
      | 'minimumCreditsPerRequest'
      | 'status'
      | 'updatedAt'
      | 'updatedBy'
    >
  >,
];

/** Who last edited a rule, where it is not the person who created it. */
export const AI_RULE_EDITOR = {
  id: 'user-grace',
  name: 'Grace Hopper',
} as const;

const SONNET = 'claude-sonnet-4-5';
const MINI = 'gpt-5-mini';
const PEO = { chargeOnError: 'PROVIDER_ERROR_ONLY' } as const;

// The four levels of the ladder: an exact model and type (Sonnet), an exact
// model for any type (Gemini Flash on enterprise-v2), any model of a type (the
// COMPLETION wildcards) and any model of any type (Starter).
const RULE_SPECS: RuleSpec[] = [
  ['starter', AI_POOL, null, null, { perRequest: '1' }],
  ['starter-v2', AI_POOL, null, null, { perRequest: '1' }],
  ['starter-v3', AI_POOL, null, null, { perRequest: '1' }],
  ['starter-v3', AI_POOL, SONNET, 'COMPLETION', { perRequest: '1.5' }],
  [
    'business',
    AI_POOL,
    SONNET,
    'COMPLETION',
    { perInputToken: '0.0006', perOutputToken: '0.003' },
    { ...PEO, minimumCreditsPerRequest: '0.01' },
  ],
  [
    'business',
    AI_POOL,
    MINI,
    'COMPLETION',
    { perInputToken: '0.00004', perOutputToken: '0.0003' },
    { ...PEO, minimumCreditsPerRequest: '0.01' },
  ],
  ['business', AI_POOL, null, 'COMPLETION', { perRequest: '2' }],
  // Priced on versions that do not grant the pool: `grantedByLicense` is false.
  [
    'business',
    PARTNER_POOL,
    null,
    null,
    { perRequest: '4' },
    { minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise',
    AI_POOL,
    SONNET,
    'COMPLETION',
    { perInputToken: '0.0005', perOutputToken: '0.0025' },
    { ...PEO, minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise',
    AI_POOL,
    null,
    'COMPLETION',
    { perInputToken: '0.0005', perOutputToken: '0.0025' },
    { minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise',
    PARTNER_POOL,
    SONNET,
    'COMPLETION',
    { perRequest: '6' },
    { minimumCreditsPerRequest: '0.01', updatedAt: '2026-09-20T10:15:00.000Z' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    SONNET,
    'COMPLETION',
    {
      perInputToken: '0.0004',
      perCachedInputToken: '0.00004',
      perCacheWriteToken: '0.0005',
      perOutputToken: '0.002',
    },
    { maximumCreditsPerRequest: '250', minimumCreditsPerRequest: '0.5' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    MINI,
    'COMPLETION',
    { perInputToken: '0.00003', perOutputToken: '0.00025' },
    // Edited after the feed's gpt-5-mini call was committed: its receipt
    // shows the rates of the snapshot and "Rule edited since".
    {
      ...PEO,
      minimumCreditsPerRequest: '0.01',
      updatedAt: '2026-11-11T09:31:00.000Z',
      updatedBy: AI_RULE_EDITOR,
    },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    'gemini-2-5-flash',
    null,
    { perRequest: '1.5' },
    { chargeOnError: 'ALWAYS', minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    'text-embedding-3-small',
    'EMBEDDING',
    { perInputToken: '0.000003' },
    { ...PEO, minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    'gpt-image-1',
    'IMAGE_GENERATION',
    { perUnit: '5' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    'gpt-4o-transcribe',
    'AUDIO',
    { perSecond: '0.02' },
    { minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise-v2',
    AI_POOL,
    null,
    'COMPLETION',
    { perInputToken: '0.0005', perOutputToken: '0.0025' },
    { minimumCreditsPerRequest: '0.01' },
  ],
  [
    'enterprise-v2',
    PARTNER_POOL,
    SONNET,
    'COMPLETION',
    { perRequest: '5' },
    { minimumCreditsPerRequest: '0.01' },
  ],
  // An archived rule: history, which no longer prices anything.
  [
    'enterprise-v2',
    AI_POOL,
    'claude-opus-4-1',
    'COMPLETION',
    { perRequest: '3' },
    { status: 'ARCHIVED', updatedAt: '2026-10-30T08:00:00.000Z' },
  ],
];

/** The conversion rules, numbered from 1 in the order above (`aiRuleId`). */
export const buildAiRules = (
  grants: readonly LicenseEntitlement[],
  /** [licenceSlug, poolSlug] pairs an add-on version can grant. */
  addonGrants: ReadonlyArray<readonly [string, string]> = [],
): ConversionRule[] =>
  RULE_SPECS.map(
    (
      [licenseSlug, entitlementSlug, modelSlug, requestType, rates, options],
      index,
    ) => ({
      chargeOnError: 'NEVER',
      createdAt: '2026-09-15T10:00:00.000Z',
      createdBy: TEST_USER,
      entitlementSlug,
      grantedByLicense: grants.some(
        (grant) =>
          grant.licenseSlug === licenseSlug &&
          grant.entitlementSlug === entitlementSlug,
      ),
      id: aiRuleId(index + 1),
      licenseSlug,
      maximumCreditsPerRequest: null,
      minimumCreditsPerRequest: '0',
      modelSlug,
      rates,
      requestType,
      status: 'ACTIVE',
      updatedAt: RULES_UPDATED_AT,
      updatedBy: TEST_USER,
      grantedByAddons: addonGrants.some(
        ([license, pool]) =>
          license === licenseSlug && pool === entitlementSlug,
      ),
      ...options,
    }),
  );
