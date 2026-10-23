import type { Entitlement, EntitlementWritable } from '@/api-client';

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

/** Normalizes NUMBER units: an all-or-none base pair and optional sale trio. */
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

  if (body.type !== 'NUMBER' || !body.unitSingular || !body.unitPlural) {
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
 * Builds the complete replacement PUT for the form and for inline rename, icon and
 * group edits. Echoes immutable resetPeriod/resetAnchor: omission would attempt
 * removal. Echoes the early-warning threshold too, which no screen edits: the API
 * stores 0 (the warning off) for a numeric entitlement sent without one.
 */
export const entitlementToUpdateBody = (
  entitlement: Entitlement,
  overrides?: Partial<EntitlementWritable>,
): EntitlementWritable => {
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
    resetPeriod: entitlement.resetPeriod,
    resetAnchor: entitlement.resetAnchor,
    warningThresholdPercent: entitlement.warningThresholdPercent ?? undefined,
    ...overrides,
  };

  if (body.type !== 'NUMBER') {
    body.aggregationMethod = undefined;
  }

  conditionUnitFields(body);

  return body;
};
