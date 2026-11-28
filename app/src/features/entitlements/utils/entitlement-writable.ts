import type {
  Entitlement,
  EntitlementSource,
  EntitlementWritable,
} from '@/api-client';
import {
  canonicalWeight,
  isCombinedEntitlement,
} from '@/domains/entitlement-usage';

const normalizeUnitLabel = (value?: string | null): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

type UnitFieldsCarrier = Pick<
  EntitlementWritable,
  | 'type'
  | 'unitSingular'
  | 'unitPlural'
  | 'saleUnitSingular'
  | 'saleUnitPlural'
  | 'saleUnitFactor'
>;

/**
 * The types that report a numeric meter: the ones that may carry units, a periodic
 * window and an early-warning threshold. Mirrors the API's number-family check.
 */
export const isNumberFamily = (
  type: EntitlementWritable['type'] | undefined,
): boolean => type === 'NUMBER' || type === 'NUMBER_AI_CREDIT';

/**
 * Normalizes the units of a numeric entitlement: an all-or-none base pair and an
 * optional sale trio. Any other type carries none. The full-replace PUT erases what
 * it leaves out, so a number-family entitlement keeps its units through every edit.
 */
export const conditionUnitFields = (body: UnitFieldsCarrier): void => {
  body.unitSingular = normalizeUnitLabel(body.unitSingular);
  body.unitPlural = normalizeUnitLabel(body.unitPlural);
  body.saleUnitSingular = normalizeUnitLabel(body.saleUnitSingular);
  body.saleUnitPlural = normalizeUnitLabel(body.saleUnitPlural);
  if (
    body.saleUnitFactor == null ||
    !Number.isFinite(body.saleUnitFactor) ||
    body.saleUnitFactor <= 0
  ) {
    body.saleUnitFactor = undefined;
  }

  if (!isNumberFamily(body.type) || !body.unitSingular || !body.unitPlural) {
    body.unitSingular = undefined;
    body.unitPlural = undefined;
    body.saleUnitSingular = undefined;
    body.saleUnitPlural = undefined;
    body.saleUnitFactor = undefined;
    return;
  }

  if (
    !body.saleUnitSingular ||
    !body.saleUnitPlural ||
    body.saleUnitFactor === undefined
  ) {
    body.saleUnitSingular = undefined;
    body.saleUnitPlural = undefined;
    body.saleUnitFactor = undefined;
  }
};

/**
 * The sources of a combined entitlement as a request names them. A PUT replaces them
 * as a whole, so every write of a combined entitlement names them again; the weight
 * is written as the API writes it back (`0.40` is `0.4`), so that a form which did
 * not change a weight sends the one it read.
 */
export const sourcesToBody = (
  sources: ReadonlyArray<Pick<EntitlementSource, 'entitlementSlug' | 'weight'>>,
): EntitlementSource[] =>
  sources.map(({ entitlementSlug, weight }) => ({
    entitlementSlug,
    weight: canonicalWeight(weight),
  }));

/**
 * Builds the complete replacement PUT for the form and for inline rename, icon and
 * group edits. Echoes immutable resetPeriod/resetAnchor: omission would attempt
 * removal. Echoes the early-warning threshold unless the edit overrides it: the
 * API stores 0 (the warning off) for a numeric entitlement sent without one. Only a
 * numeric entitlement echoes it: the API returns 0 for every type but refuses any
 * threshold on the others, so a boolean or a config entitlement sends none.
 *
 * A numeric entitlement echoes where its usage comes from (`usageSource`, which is
 * immutable), and a combined one its sources too: the PUT replaces them as a whole
 * and refuses one that names none (422 `UpdateEntitlement.CombinedSourcesRequired`),
 * so a rename without them would be refused. A combined entitlement sends neither
 * the window nor a threshold: it takes the window its sources share (a value sent
 * must match it, and the sources may change it), and nothing crosses on a sum.
 */
export const entitlementToUpdateBody = (
  entitlement: Entitlement,
  overrides?: Partial<EntitlementWritable>,
): EntitlementWritable => {
  const combined = isCombinedEntitlement(entitlement);
  const body: EntitlementWritable = {
    aggregationMethod: entitlement.aggregationMethod,
    description: entitlement.description ?? '',
    groupSlugs:
      entitlement.entitlementGroups?.flatMap((group) =>
        group.slug ? [group.slug] : [],
      ) ?? [],
    icon: entitlement.icon ?? undefined,
    name: entitlement.name,
    type: entitlement.type,
    userFacing: entitlement.userFacing ?? false,
    displayOrder: entitlement.displayOrder ?? 0,
    unitSingular: entitlement.unitSingular ?? undefined,
    unitPlural: entitlement.unitPlural ?? undefined,
    saleUnitSingular: entitlement.saleUnitSingular ?? undefined,
    saleUnitPlural: entitlement.saleUnitPlural ?? undefined,
    saleUnitFactor: entitlement.saleUnitFactor ?? undefined,
    resetPeriod: combined ? undefined : entitlement.resetPeriod,
    resetAnchor: combined ? undefined : entitlement.resetAnchor,
    ...(isNumberFamily(entitlement.type)
      ? {
          usageSource: entitlement.usageSource,
          warningThresholdPercent: combined
            ? undefined
            : (entitlement.warningThresholdPercent ?? undefined),
        }
      : {}),
    ...(combined ? { sources: sourcesToBody(entitlement.sources ?? []) } : {}),
    ...overrides,
  };

  if (!isNumberFamily(body.type)) {
    delete body.aggregationMethod;
    delete body.warningThresholdPercent;
  }

  conditionUnitFields(body);

  return body;
};
