import type { Model, VendorCosts } from '@/api-client';
import type { RateCardLicense } from '@/domains/ai-credits';
import { perMillionDisplay } from './openrouter-ui';

/**
 * What the model list derives from its two reads, the catalogue and the rate
 * card. Pure: no React, no request, no copy.
 */

/** The statuses a model can be filtered on; `all` shows every one. */
export const MODEL_STATUS_FILTERS = [
  'all',
  'ACTIVE',
  'DEPRECATED',
  'ARCHIVED',
] as const;

export type ModelStatusFilter = (typeof MODEL_STATUS_FILTERS)[number];

/**
 * A model's vendor costs on one line, in the unit a person compares: USD per
 * million tokens for what is priced per token (an exact shift of the decimal,
 * for display only), USD per unit for what is priced per unit. Null when the
 * catalogue has no cost for the model.
 */
export type VendorCostSummary = {
  /** USD per million tokens. */
  input: string | null;
  output: string | null;
  /** USD per unit: an image, a second of audio. */
  unit: string | null;
};

export function vendorCostSummary(
  costs: VendorCosts | undefined,
): VendorCostSummary | null {
  const perMillion = (value: string | undefined) =>
    value ? perMillionDisplay(value) : null;
  const summary = {
    input: perMillion(costs?.perInputToken),
    output: perMillion(costs?.perOutputToken),
    unit: costs?.perUnit ?? null,
  };

  return summary.input || summary.output || summary.unit ? summary : null;
}

/**
 * How many active rules name each model, over every licence version and pool:
 * what the rate card read carries. Wildcards name no model and are not counted;
 * archived rules are not in the read, so a model may still be referenced by one
 * when its count is zero (the API then refuses its deletion, and says so).
 */
export function ruleCountsByModel(
  licenses: readonly RateCardLicense[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const license of licenses) {
    for (const rule of license.conversionRules) {
      if (rule.modelSlug && rule.status === 'ACTIVE') {
        counts.set(rule.modelSlug, (counts.get(rule.modelSlug) ?? 0) + 1);
      }
    }
  }

  return counts;
}

/** The models a search and a status filter keep. `labels` are the words shown for a model. */
export function filterModels(
  models: readonly Model[],
  options: {
    labels: (model: Model) => string[];
    search: string;
    status: ModelStatusFilter;
  },
): Model[] {
  const needle = options.search.trim().toLocaleLowerCase();

  return models.filter(
    (model) =>
      (options.status === 'all' || model.status === options.status) &&
      [model.name, model.slug, model.vendor, ...options.labels(model)].some(
        (value) => value.toLocaleLowerCase().includes(needle),
      ),
  );
}
