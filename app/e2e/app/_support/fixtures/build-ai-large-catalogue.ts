import type {
  ConversionRule,
  License,
  LicenseEntitlement,
  Model,
} from '@/api-client';
import { AI_POOL, aiRuleId, buildAiModels } from './build-ai-catalogue';
import { TEST_USER } from './build-customer';
import { buildLicense } from './build-license';

/**
 * The large catalogue: the thirteen models of the default world plus forty-two
 * more, fifty-three of them active across ten vendors (forty-seven rows on the
 * Completion tab), and two more Enterprise versions so that one family shows
 * four columns. It exists to look at, and to
 * measure, the rate card at the size a real catalogue reaches. All synthetic:
 * the costs are round figures, not any vendor's price list.
 */

type ModelSpec = [
  slug: string,
  name: string,
  modality: Model['modality'],
  /** USD per million input tokens, then per million output tokens. */
  input: number,
  output: number,
];

const EXTRA_MODELS: Record<string, ModelSpec[]> = {
  Anthropic: [
    ['claude-opus-4-5', 'Claude Opus 4.5', 'TEXT', 5, 25],
    ['claude-sonnet-4', 'Claude Sonnet 4', 'TEXT', 3, 15],
    ['claude-haiku-3-5', 'Claude Haiku 3.5', 'TEXT', 0.8, 4],
  ],
  OpenAI: [
    ['gpt-5-nano', 'GPT-5 nano', 'MULTIMODAL', 0.05, 0.4],
    ['gpt-4-1', 'GPT-4.1', 'MULTIMODAL', 2, 8],
    ['gpt-4-1-mini', 'GPT-4.1 mini', 'MULTIMODAL', 0.4, 1.6],
    ['o4-mini', 'o4-mini', 'TEXT', 1.1, 4.4],
    ['text-embedding-3-large', 'Text Embedding 3 Large', 'EMBEDDING', 0.13, 0],
  ],
  Google: [
    ['gemini-3-pro', 'Gemini 3 Pro', 'MULTIMODAL', 2, 12],
    ['gemini-2-0-flash', 'Gemini 2.0 Flash', 'MULTIMODAL', 0.1, 0.4],
    ['gemini-embedding-001', 'Gemini Embedding 001', 'EMBEDDING', 0.15, 0],
  ],
  Mistral: [
    ['mistral-large', 'Mistral Large', 'TEXT', 2, 6],
    ['mistral-medium-3', 'Mistral Medium 3', 'TEXT', 0.4, 2],
    ['mistral-small-3', 'Mistral Small 3', 'TEXT', 0.1, 0.3],
    ['codestral', 'Codestral', 'TEXT', 0.3, 0.9],
    ['pixtral-large', 'Pixtral Large', 'MULTIMODAL', 2, 6],
    ['ministral-8b', 'Ministral 8B', 'TEXT', 0.1, 0.1],
    ['mistral-nemo', 'Mistral Nemo', 'TEXT', 0.15, 0.15],
  ],
  Meta: [
    ['llama-4-maverick', 'Llama 4 Maverick', 'MULTIMODAL', 0.27, 0.85],
    ['llama-4-scout', 'Llama 4 Scout', 'MULTIMODAL', 0.18, 0.59],
    ['llama-3-3-70b', 'Llama 3.3 70B', 'TEXT', 0.6, 0.6],
    ['llama-3-1-8b', 'Llama 3.1 8B', 'TEXT', 0.05, 0.08],
    // No output cost: a completion is costed in part only ("partial cost").
    ['llama-guard-4', 'Llama Guard 4', 'TEXT', 0.2, 0],
    ['llama-4-behemoth', 'Llama 4 Behemoth', 'MULTIMODAL', 1.2, 3.6],
  ],
  Cohere: [
    ['command-a', 'Command A', 'TEXT', 2.5, 10],
    ['command-r-plus', 'Command R+', 'TEXT', 2.5, 10],
    ['command-r', 'Command R', 'TEXT', 0.15, 0.6],
    ['command-r7b', 'Command R7B', 'TEXT', 0.04, 0.15],
    ['embed-v4', 'Embed v4', 'EMBEDDING', 0.12, 0],
  ],
  xAI: [
    ['grok-4', 'Grok 4', 'MULTIMODAL', 3, 15],
    ['grok-4-fast', 'Grok 4 Fast', 'MULTIMODAL', 0.2, 0.5],
    ['grok-3-mini', 'Grok 3 mini', 'TEXT', 0.3, 0.5],
    ['grok-code-fast', 'Grok Code Fast', 'TEXT', 0.2, 1.5],
    ['grok-3', 'Grok 3', 'TEXT', 3, 15],
  ],
  DeepSeek: [
    ['deepseek-chat', 'DeepSeek Chat', 'TEXT', 0.28, 0.42],
    ['deepseek-reasoner', 'DeepSeek Reasoner', 'TEXT', 0.55, 2.19],
    ['deepseek-coder', 'DeepSeek Coder', 'TEXT', 0.14, 0.28],
    ['deepseek-v3', 'DeepSeek V3', 'TEXT', 0.27, 1.1],
  ],
  Amazon: [
    ['nova-pro', 'Nova Pro', 'MULTIMODAL', 0.8, 3.2],
    ['nova-lite', 'Nova Lite', 'MULTIMODAL', 0.06, 0.24],
    ['nova-micro', 'Nova Micro', 'TEXT', 0.035, 0.14],
    ['nova-premier', 'Nova Premier', 'MULTIMODAL', 2.5, 12.5],
  ],
};

/** A figure as the decimal string the API takes: no exponent, no trailing zeros. */
const decimal = (value: number, places: number) =>
  value.toFixed(places).replace(/\.?0+$/, '');

const perToken = (usdPerMillion: number) => decimal(usdPerMillion / 1e6, 12);

const specs = () =>
  Object.entries(EXTRA_MODELS).flatMap(([vendor, models]) =>
    models.map((spec) => ({ spec, vendor })),
  );

/** The default catalogue and forty-two more models, every one of them active. */
export const buildLargeAiModels = (): Model[] => [
  ...buildAiModels(),
  ...specs().map(({ spec: [slug, name, modality, input, output], vendor }) => ({
    createdAt: '2026-09-02T10:00:00.000Z',
    externalIds: [],
    id: `model-${slug}`,
    modality,
    name,
    slug,
    status: 'ACTIVE' as const,
    updatedAt: '2026-09-02T10:00:00.000Z',
    vendor,
    vendorCosts: {
      currency: 'USD' as const,
      perInputToken: perToken(input),
      ...(output ? { perOutputToken: perToken(output) } : {}),
    },
  })),
];

/** Enterprise v3 (published) and v4 (in draft): the family then has four versions. */
export const buildLargeAiVersions = (): License[] =>
  (
    [
      [3, 'PUBLISHED', '2027'],
      [4, 'DRAFT', '2028'],
    ] as const
  ).map(([n, lifecycleState, versionName]) =>
    buildLicense({
      description: 'Enterprise plan',
      familyId: 'family-enterprise',
      id: `license-enterprise-v${n}`,
      lifecycleState,
      name: 'Enterprise',
      slug: `enterprise-v${n}`,
      type: 'PAID',
      version: String(n),
      versionName,
    }),
  );

/** What the two added versions grant of the shared pool: [limit, overage percent]. */
export const LARGE_AI_GRANTS: Record<string, [number, number]> = {
  'enterprise-v3': [400_000, 10],
  'enterprise-v4': [500_000, 15],
};

export const buildLargeAiGrants = (
  versions: readonly License[],
): LicenseEntitlement[] =>
  versions.map((license) => {
    const [value, overagePercent] = LARGE_AI_GRANTS[license.slug ?? ''];
    return {
      createdAt: license.createdAt,
      createdBy: TEST_USER,
      entitlementName: 'AI credits',
      entitlementSlug: AI_POOL,
      entitlementType: 'NUMBER_AI_CREDIT',
      licenseId: license.id,
      licenseSlug: license.slug ?? license.id,
      limitCapExceededOveragePercent: overagePercent,
      updatedAt: license.createdAt,
      updatedBy: TEST_USER,
      value: { type: 'number', value },
    };
  });

// Credits per token at a cost of $0.008 a credit on v2, cheaper by a tenth on
// each later version, so that the columns of a model differ.
const VERSION_FACTOR: Record<string, number> = {
  'enterprise-v2': 125,
  'enterprise-v3': 112.5,
  'enterprise-v4': 100,
};

/**
 * A rule of its own for every added model on the three Enterprise versions
 * that are not archived, and the completion wildcard on the two new ones: 128
 * rules, numbered from 101 (`aiRuleId`).
 */
export const buildLargeAiRules = (): ConversionRule[] => {
  const base = {
    chargeOnError: 'NEVER' as const,
    createdAt: '2026-10-02T10:00:00.000Z',
    createdBy: TEST_USER,
    entitlementSlug: AI_POOL,
    grantedByAddons: false,
    grantedByLicense: true,
    maximumCreditsPerRequest: null,
    minimumCreditsPerRequest: '0.01',
    status: 'ACTIVE' as const,
    updatedAt: '2026-10-28T14:02:00.000Z',
    updatedBy: TEST_USER,
  };
  const own = Object.entries(VERSION_FACTOR).flatMap(([licenseSlug, factor]) =>
    specs().map(({ spec: [modelSlug, , modality, input, output] }) => ({
      ...base,
      licenseSlug,
      modelSlug,
      rates: {
        perInputToken: decimal((input / 1e6) * factor, 10),
        ...(output
          ? { perOutputToken: decimal((output / 1e6) * factor, 10) }
          : {}),
      },
      requestType:
        modality === 'EMBEDDING'
          ? ('EMBEDDING' as const)
          : ('COMPLETION' as const),
    })),
  );
  const wildcards = ['enterprise-v3', 'enterprise-v4'].map((licenseSlug) => ({
    ...base,
    licenseSlug,
    modelSlug: null,
    rates: { perInputToken: '0.0005', perOutputToken: '0.0025' },
    requestType: 'COMPLETION' as const,
  }));
  return [...own, ...wildcards].map((rule, index) => ({
    ...rule,
    id: aiRuleId(101 + index),
  }));
};
