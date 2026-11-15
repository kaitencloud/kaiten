import { formOptions } from '@tanstack/react-form';
import type { z } from 'zod';
import type { ConversionRule } from '@/api-client';
import { zCreateConversionRule } from '@/api-client/zod.gen';
import {
  type AiRequestType,
  compareDecimals,
  parseDecimal,
  type PricingTerms,
  type RateKey,
} from '../engine';

/**
 * The form of a rule: its seven rates, its bounds and what it charges on an
 * error. The pool, the model and the request type are not in it: they make the
 * identity of a rule and never change once it exists. A blank field is `null`,
 * never an empty string: for the API a blank rate is "unpriced".
 */

export const RATE_KEYS: readonly RateKey[] = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
  'perSecond',
];

export const CHARGE_POLICIES = [
  'NEVER',
  'PROVIDER_ERROR_ONLY',
  'ALWAYS',
] as const satisfies readonly ConversionRule['chargeOnError'][];

export const ruleFormSchema = zCreateConversionRule
  .pick({ maximumCreditsPerRequest: true, rates: true })
  .extend({
    chargeOnError: zCreateConversionRule.shape.chargeOnError
      .removeDefault()
      .unwrap(),
    minimumCreditsPerRequest:
      zCreateConversionRule.shape.minimumCreditsPerRequest
        .removeDefault()
        .unwrap()
        .nullable(),
  })
  .superRefine((value, context) => {
    if (!RATE_KEYS.some((key) => value.rates[key] != null)) {
      context.addIssue({
        code: 'custom',
        message: 'AI.Panel.form.errors.noRate',
        path: ['rates'],
      });
    }
    const minimum = parseDecimal(value.minimumCreditsPerRequest ?? '0');
    const maximum = parseDecimal(value.maximumCreditsPerRequest);
    if (
      minimum !== null &&
      maximum !== null &&
      compareDecimals(maximum, minimum) < 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'AI.Panel.form.errors.maximumBelowMinimum',
        path: ['maximumCreditsPerRequest'],
      });
    }
  });

export type RuleFormValues = z.input<typeof ruleFormSchema>;

const NO_RATES = Object.fromEntries(
  RATE_KEYS.map((key) => [key, null]),
) as Record<RateKey, string | null>;

/** A new rule: nothing is filled in, so nothing can be saved untouched. */
export const EMPTY_RULE_VALUES: RuleFormValues = {
  chargeOnError: 'NEVER',
  maximumCreditsPerRequest: null,
  minimumCreditsPerRequest: null,
  rates: NO_RATES,
};

// Shared by the form and the sections that render it, so that each is typed on
// the values of the form it belongs to.
export const ruleFormOpts = formOptions({
  defaultValues: EMPTY_RULE_VALUES,
  validators: { onChange: ruleFormSchema },
});

/** The form of an existing rule, or of a new one started from another's terms. */
export function ruleValuesOf(terms: PricingTerms): RuleFormValues {
  return {
    chargeOnError: terms.chargeOnError,
    maximumCreditsPerRequest: terms.maximumCreditsPerRequest ?? null,
    minimumCreditsPerRequest: terms.minimumCreditsPerRequest,
    rates: Object.fromEntries(
      RATE_KEYS.map((key) => [key, terms.rates[key] ?? null]),
    ) as Record<RateKey, string | null>,
  };
}

/** What the form says, as the engine prices it and the API takes it. */
export function ruleTermsOf(values: RuleFormValues): PricingTerms {
  return {
    chargeOnError: values.chargeOnError,
    maximumCreditsPerRequest: values.maximumCreditsPerRequest ?? null,
    minimumCreditsPerRequest: values.minimumCreditsPerRequest ?? '0',
    rates: Object.fromEntries(
      RATE_KEYS.map((key) => [key, values.rates[key] ?? null]),
    ),
  };
}

/** Whether any rate is typed: the least a rule needs to price anything. */
export function hasRate(values: RuleFormValues): boolean {
  return RATE_KEYS.some((key) => values.rates[key] != null);
}

/** What names a rule: its level on the ladder of one version and pool. */
export type RuleIdentity = {
  licenseSlug: string;
  entitlementSlug: string;
  modelSlug: string | null;
  requestType: AiRequestType | null;
};

/** The rates a request type usually prices; the others sit under "Other rates". */
const RELEVANT_RATES: Readonly<Record<AiRequestType, readonly RateKey[]>> = {
  COMPLETION: [
    'perRequest',
    'perInputToken',
    'perCachedInputToken',
    'perCacheWriteToken',
    'perOutputToken',
  ],
  EMBEDDING: ['perRequest', 'perInputToken'],
  IMAGE_GENERATION: ['perRequest', 'perUnit'],
  AUDIO: ['perRequest', 'perUnit', 'perSecond'],
  VIDEO: ['perRequest', 'perUnit', 'perSecond'],
};

export function relevantRates(
  requestType: AiRequestType | null,
): readonly RateKey[] {
  return requestType === null ? RATE_KEYS : RELEVANT_RATES[requestType];
}

export type RatePreset =
  | 'PER_REQUEST'
  | 'INPUT_OUTPUT'
  | 'TOKENS_WITH_CACHE'
  | 'PER_UNIT'
  | 'PER_SECOND';

const PRESET_RATES: Readonly<Record<RatePreset, readonly RateKey[]>> = {
  PER_REQUEST: ['perRequest'],
  INPUT_OUTPUT: ['perInputToken', 'perOutputToken'],
  TOKENS_WITH_CACHE: [
    'perInputToken',
    'perCachedInputToken',
    'perCacheWriteToken',
    'perOutputToken',
  ],
  PER_UNIT: ['perUnit'],
  PER_SECOND: ['perSecond'],
};

const TYPE_PRESETS: Readonly<Record<AiRequestType, readonly RatePreset[]>> = {
  COMPLETION: ['PER_REQUEST', 'INPUT_OUTPUT', 'TOKENS_WITH_CACHE'],
  EMBEDDING: ['PER_REQUEST', 'INPUT_OUTPUT'],
  IMAGE_GENERATION: ['PER_REQUEST', 'PER_UNIT'],
  AUDIO: ['PER_REQUEST', 'PER_UNIT', 'PER_SECOND'],
  VIDEO: ['PER_REQUEST', 'PER_UNIT', 'PER_SECOND'],
};

/** The presets offered for the request type the panel is on. */
export function presetsFor(type: AiRequestType): readonly RatePreset[] {
  return TYPE_PRESETS[type];
}

/**
 * The fields a preset shows. A preset sets no value: it only chooses which
 * rates are in view. An embedding has no output, so its "input + output" is
 * the input alone.
 */
export function presetRates(
  preset: RatePreset,
  type: AiRequestType,
): readonly RateKey[] {
  return preset === 'INPUT_OUTPUT' && type === 'EMBEDDING'
    ? ['perInputToken']
    : PRESET_RATES[preset];
}
