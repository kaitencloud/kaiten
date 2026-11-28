import type { Entitlement, EntitlementSource } from '@/api-client';
import { BillingProblem } from './billing-problem';

/**
 * The rules of a combined entitlement (`usageSource` COMBINED_USAGE), as the API words
 * them: the weighted sum of the usage of other entitlements, computed when it is read.
 * The mocks refuse in the order and with the codes of
 * `api/internal/modules/entitlements/combined`, so that a spec sees what a form sends
 * wrong, and a form that sends right is never refused.
 */

type Operation = 'CreateEntitlement' | 'UpdateEntitlement';
type Definition = Entitlement;

const SOURCE_WEIGHT = /^[0-9]{1,8}(\.[0-9]{1,10})?$/;

const isNumberFamily = (type: Definition['type'] | undefined) =>
  type === 'NUMBER' || type === 'NUMBER_AI_CREDIT';

/** The weight as the API writes it back: `0.40` is `0.4`, and none is `1`. */
export function canonicalWeight(weight: string | undefined): string {
  if (weight === undefined || weight === '') {
    return '1';
  }
  const [integer, fraction = ''] = weight.split('.');
  const kept = fraction.replace(/0+$/, '');
  const whole = integer.replace(/^0+(?=\d)/, '');

  return kept ? `${whole}.${kept}` : whole;
}

/** The window a definition counts over: both absent for a lifetime counter. */
type Window = Pick<Definition, 'resetAnchor' | 'resetPeriod'>;

const sameWindow = (left: Window, right: Window) =>
  (left.resetPeriod ?? null) === (right.resetPeriod ?? null) &&
  (left.resetAnchor ?? null) === (right.resetAnchor ?? null);

const describeWindow = ({ resetAnchor, resetPeriod }: Window) =>
  resetPeriod
    ? `resetPeriod ${resetPeriod}, resetAnchor ${resetAnchor}`
    : 'a lifetime counter';

/**
 * Where the usage of a new entitlement comes from, and what that asks of the request:
 * a number is calculated unless it says combined, a flag and a configuration have no
 * usage to say the source of, and the credit pools are always calculated.
 */
export function resolveUsageSource(
  operation: Operation,
  type: Definition['type'] | undefined,
  usageSource: Definition['usageSource'],
): Definition['usageSource'] {
  if (usageSource !== undefined) {
    if (!isNumberFamily(type)) {
      throw new BillingProblem(
        400,
        `${operation}.InvalidUsageSourceConfiguration`,
        'usageSource is only allowed when type is NUMBER or NUMBER_AI_CREDIT',
      );
    }
    if (type === 'NUMBER_AI_CREDIT' && usageSource !== 'CALCULATED_USAGE') {
      throw new BillingProblem(
        400,
        `${operation}.InvalidUsageSourceConfiguration`,
        'usageSource must be CALCULATED_USAGE when type is NUMBER_AI_CREDIT',
      );
    }
  }

  return isNumberFamily(type) ? (usageSource ?? 'CALCULATED_USAGE') : undefined;
}

/** Sources on an entitlement that is not combined are refused, an empty list is not. */
export function refuseSourcesOnCalculated(
  operation: Operation,
  sources: Definition['sources'],
) {
  if ((sources ?? []).length > 0) {
    throw new BillingProblem(
      422,
      `${operation}.SourcesNotAllowed`,
      'sources are only allowed when usageSource is COMBINED_USAGE',
    );
  }
}

/** A combined entitlement shows no warning: nothing crosses on a sum. 0 is accepted. */
export function refuseWarningThreshold(
  operation: Operation,
  warningThresholdPercent: number | undefined,
) {
  if ((warningThresholdPercent ?? 0) > 0) {
    throw new BillingProblem(
      422,
      `${operation}.CombinedWarningThreshold`,
      'a combined entitlement has no warning threshold: events fire on its sources, not on their sum',
    );
  }
}

/** At least two sources, each named once, each with a strictly positive exact weight. */
function parseSources(operation: Operation, sources: EntitlementSource[]) {
  if (sources.length < 2) {
    throw new BillingProblem(
      422,
      `${operation}.CombinedSourcesRequired`,
      'a combined entitlement sums at least two sources',
    );
  }
  const named = new Set<string>();

  return sources.map(({ entitlementSlug, weight }) => {
    if (named.has(entitlementSlug)) {
      throw new BillingProblem(
        422,
        `${operation}.CombinedSourceDuplicate`,
        `a source can be named only once: "${entitlementSlug}"`,
      );
    }
    named.add(entitlementSlug);
    if (
      weight !== undefined &&
      (!SOURCE_WEIGHT.test(weight) || !/[1-9]/.test(weight))
    ) {
      throw new BillingProblem(
        422,
        `${operation}.CombinedSourceWeightInvalid`,
        `a source weight must be an exact decimal, strictly positive, with at most 8 integer digits and 10 decimals: "${weight}" of "${entitlementSlug}"`,
      );
    }

    return { entitlementSlug, weight: canonicalWeight(weight) };
  });
}

export type ResolvedSources = {
  sources: EntitlementSource[];
  window: Window;
};

/**
 * The sources a combined entitlement names, read in the catalogue and checked: each must
 * exist (404), be a number that is not combined itself, be summed or counted, and share
 * its window with the others, lifetime included. They come back alphabetically by slug,
 * as the API lists them, with the window they share.
 */
export function resolveSources(
  operation: Operation,
  catalogue: readonly Definition[],
  named: EntitlementSource[],
): ResolvedSources {
  const parsed = parseSources(operation, named);
  let window: Window | undefined;
  let first = '';

  for (const { entitlementSlug } of parsed) {
    const source = catalogue.find((entry) => entry.slug === entitlementSlug);
    if (!source) {
      throw new BillingProblem(
        404,
        `${operation}.SourceNotFound`,
        `source entitlement "${entitlementSlug}" not found`,
      );
    }
    if (!isNumberFamily(source.type)) {
      throw new BillingProblem(
        422,
        `${operation}.SourceUnsupportedType`,
        `source "${entitlementSlug}" is a ${source.type} entitlement: only a NUMBER or NUMBER_AI_CREDIT entitlement can be summed`,
      );
    }
    if (source.usageSource === 'COMBINED_USAGE') {
      throw new BillingProblem(
        422,
        `${operation}.SourceIsCombined`,
        `source "${entitlementSlug}" is a combined entitlement itself: a combined entitlement cannot sum another`,
      );
    }
    if (
      source.aggregationMethod !== 'SUM' &&
      source.aggregationMethod !== 'COUNT'
    ) {
      throw new BillingProblem(
        422,
        `${operation}.SourceUnsupportedAggregation`,
        `source "${entitlementSlug}" is not aggregated by SUM or COUNT: a weighted sum of an average, a maximum or a latest value means nothing`,
      );
    }
    if (!window) {
      window = {
        resetAnchor: source.resetAnchor,
        resetPeriod: source.resetPeriod,
      };
      first = entitlementSlug;
    } else if (!sameWindow(window, source)) {
      throw new BillingProblem(
        422,
        `${operation}.SourceWindowMismatch`,
        `source "${entitlementSlug}" is on ${describeWindow(source)}, where "${first}" is on ${describeWindow(window)}: the sources of a combined entitlement share one reset period and anchor, lifetime included`,
      );
    }
  }

  return {
    sources: [...parsed].sort((left, right) =>
      left.entitlementSlug.localeCompare(right.entitlementSlug),
    ),
    window: window ?? {},
  };
}

/**
 * A window the caller sent is accepted only when it is the one the sources share: a
 * combined entitlement takes it from them, and an edit may move the sources to another.
 */
export function checkSentWindow(
  operation: Operation,
  sent: Window,
  derived: Window,
) {
  const sentAnchor = sent.resetPeriod
    ? (sent.resetAnchor ?? 'CALENDAR')
    : sent.resetAnchor;
  if (
    (sent.resetPeriod !== undefined || sentAnchor !== undefined) &&
    !sameWindow(
      { resetAnchor: sentAnchor, resetPeriod: sent.resetPeriod },
      derived,
    )
  ) {
    throw new BillingProblem(
      422,
      `${operation}.CombinedWindowMismatch`,
      `a combined entitlement takes its window from its sources, which are on ${describeWindow(derived)}: omit resetPeriod and resetAnchor, or send those`,
    );
  }
}

/** The slugs of the combined entitlements that sum an entitlement. */
export function combinedOf(
  catalogue: readonly Definition[],
  slug: string,
): string[] {
  return catalogue
    .filter((entry) =>
      (entry.sources ?? []).some((source) => source.entitlementSlug === slug),
    )
    .flatMap((entry) => (entry.slug ? [entry.slug] : []));
}
