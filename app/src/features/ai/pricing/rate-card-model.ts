import type { Entitlement, Model } from '@/api-client';
import {
  AI_REQUEST_TYPES,
  type AiRequestType,
  modelShowsRequestType,
  type PricingRule,
} from './engine';
import {
  type AddonGrantsState,
  rateCardCellOf,
  type RateCardLicense,
  type RateCardRule,
  WILDCARD_CELL_MODEL,
} from '@/domains/ai-credits';

/**
 * What the rate card shows, derived from the three reads (pools, models, licence
 * versions with their grants and rules). Pure: no React, no arithmetic on prices.
 */

/** The value of `family` that shows the current version of each family. */
export const CURRENT_FAMILIES = 'current';

export type RateCardGrant =
  | { granted: false }
  | { granted: true; unlimited: boolean; amount: number | null };

/**
 * A rule as the rate card holds it: what resolution needs, and what the read
 * says besides (who wrote it, whether an add-on can grant its pool).
 */
export type CardRule = PricingRule &
  Partial<
    Pick<
      RateCardRule,
      'createdAt' | 'createdBy' | 'grantedByAddons' | 'updatedBy'
    >
  >;

export type RateCardVersion = {
  slug: string;
  name: string;
  versionLabel: string;
  /** The version's number in its family: the order of the columns. */
  versionNumber: number;
  familySlug: string;
  lifecycle: RateCardLicense['lifecycleState'];
  grant: RateCardGrant;
  /**
   * An add-on version compatible with the family grants the pool, so an
   * instance on this version can hold it without the licence granting it. It
   * does not say any instance does. Known from the rules: false where the
   * version has no rule for the pool, until the add-on grants are read.
   */
  addonGranted: boolean;
  /** The add-on versions that can grant it, once read (`useAddonGrants`). */
  addons?: AddonGrantsState;
  /** The active rules of this version for the pool. */
  rules: CardRule[];
  /** Grants the pool, is not archived and no rule prices anything: calls are refused. */
  flagged: boolean;
};

export type RateCardFamily = { slug: string; name: string };

export type VendorGroup = { vendor: string; models: Model[] };

export type CellRef = { licenseSlug: string; modelSlug: string | null };

const byVersion = (a: RateCardLicense, b: RateCardLicense) =>
  a.versionNumber - b.versionNumber || a.slug.localeCompare(b.slug);

/** A pool is an AI credit entitlement that sums what is reported. */
export function creditPools(entitlements: readonly Entitlement[]) {
  return entitlements.filter(
    (item) =>
      item.type === 'NUMBER_AI_CREDIT' &&
      item.aggregationMethod === 'SUM' &&
      Boolean(item.slug),
  );
}

/**
 * The version a family shows in "the current version of each family": the one
 * the API says the family serves (`family.currentVersion`, its default or its
 * highest-numbered published version). A family with nothing published has
 * none: its highest-numbered version that is not archived stands in, else its
 * highest, so that the family keeps a column.
 */
export function currentVersionOf(
  versions: readonly RateCardLicense[],
): RateCardLicense | undefined {
  const served = versions[0]?.family.currentVersion?.slug;
  const ordered = [...versions].sort(byVersion).reverse();

  return (
    ordered.find((item) => item.slug === served) ??
    ordered.find((item) => item.lifecycleState !== 'ARCHIVED') ??
    ordered[0]
  );
}

/**
 * The name a family goes by. A family has no name of its own: it is shown
 * under the name of the version it serves, else of its highest-numbered one.
 */
export function familyNameOf(versions: readonly RateCardLicense[]): string {
  const [highest] = [...versions].sort(byVersion).reverse();

  return (
    versions[0]?.family.currentVersion?.name ??
    highest?.name ??
    versions[0]?.family.slug ??
    ''
  );
}

function groupByFamily(licenses: readonly RateCardLicense[]) {
  const families = new Map<string, RateCardLicense[]>();
  for (const license of licenses) {
    const list = families.get(license.family.slug) ?? [];
    list.push(license);
    families.set(license.family.slug, list);
  }

  return families;
}

/**
 * The versions with what the add-on grants read says of their family: the
 * add-ons themselves, and that one grants the pool where the version has no
 * rule to say so.
 */
export function withAddonGrants(
  versions: readonly RateCardVersion[],
  grants: ReadonlyMap<string, AddonGrantsState>,
): RateCardVersion[] {
  return versions.map((version) => {
    const addons = grants.get(version.familySlug);

    return {
      ...version,
      addonGranted:
        version.addonGranted ||
        (addons?.status === 'READY' && addons.grants.length > 0),
      addons,
    };
  });
}

/** The families, named after the version each resolves to. */
export function familiesOf(
  licenses: readonly RateCardLicense[],
): RateCardFamily[] {
  return [...groupByFamily(licenses)]
    .map(([slug, versions]) => ({ slug, name: familyNameOf(versions) || slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function grantOf(license: RateCardLicense, pool: string): RateCardGrant {
  const grant = license.entitlements.find(
    (item) => item.entitlementSlug === pool,
  );
  if (!grant) {
    return { granted: false };
  }
  const value: unknown = (grant.value as { value?: unknown } | null)?.value;

  return {
    granted: true,
    // An overage of -1 % is unlimited too, as the pool's Pricing tab reads it.
    unlimited: grant.unlimited || grant.limitCapExceededOveragePercent === -1,
    amount: typeof value === 'number' ? value : null,
  };
}

function toVersion(license: RateCardLicense, pool: string): RateCardVersion {
  const rules = license.conversionRules.filter(
    (rule) => rule.entitlementSlug === pool && rule.status === 'ACTIVE',
  );
  const grant = grantOf(license, pool);

  return {
    slug: license.slug,
    name: license.name,
    versionLabel: license.versionName ?? license.version,
    versionNumber: license.versionNumber,
    familySlug: license.family.slug,
    lifecycle: license.lifecycleState,
    grant,
    addonGranted: rules.some((rule) => rule.grantedByAddons),
    rules,
    flagged:
      grant.granted &&
      license.lifecycleState !== 'ARCHIVED' &&
      rules.length === 0,
  };
}

/**
 * The family the view shows: the one asked for when it exists, else the family
 * of a deep-linked version, else the current version of each family.
 */
export function resolveFamily(
  licenses: readonly RateCardLicense[],
  family: string | undefined,
  version: string | undefined,
): string {
  const families = groupByFamily(licenses);
  if (family && family !== CURRENT_FAMILIES && families.has(family)) {
    return family;
  }
  if (!family && version) {
    const linked = licenses.find((item) => item.slug === version);
    const current = linked
      ? currentVersionOf(families.get(linked.family.slug) ?? [])
      : undefined;
    // A deep link to a version that is not its family's current one opens the
    // family, where that version has a column.
    if (linked && current?.slug !== linked.slug) {
      return linked.family.slug;
    }
  }

  return CURRENT_FAMILIES;
}

/** The columns: every version of one family, or the current version of each. */
export function versionsInView(
  licenses: readonly RateCardLicense[],
  pool: string,
  family: string,
): RateCardVersion[] {
  const families = groupByFamily(licenses);
  if (family !== CURRENT_FAMILIES) {
    return [...(families.get(family) ?? [])]
      .sort(byVersion)
      .map((license) => toVersion(license, pool));
  }

  return [...families.values()]
    .flatMap((versions) => currentVersionOf(versions) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name) || byVersion(a, b))
    .map((license) => toVersion(license, pool));
}

export type ModelStatusFilter = 'active' | 'all';

const shown = (model: Model, status: ModelStatusFilter) =>
  status === 'all' || model.status !== 'ARCHIVED';

/** The request types a tab exists for, with the number of models under each. */
export function requestTypeTabs(
  models: readonly Model[],
  status: ModelStatusFilter,
): { type: AiRequestType; count: number }[] {
  return AI_REQUEST_TYPES.flatMap((type) => {
    const all = models.filter((model) => modelShowsRequestType(model, type));
    if (all.length === 0) {
      return [];
    }

    return [
      { type, count: all.filter((model) => shown(model, status)).length },
    ];
  });
}

/** The rows: the models of a request type, filtered, grouped by vendor. */
export function vendorGroups(
  models: readonly Model[],
  options: { type: AiRequestType; status: ModelStatusFilter; q: string },
): VendorGroup[] {
  const needle = options.q.trim().toLowerCase();
  const rows = models
    .filter(
      (model) =>
        modelShowsRequestType(model, options.type) &&
        shown(model, options.status) &&
        (!needle ||
          `${model.name} ${model.slug} ${model.vendor}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort(
      (a, b) =>
        a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name),
    );
  const groups = new Map<string, Model[]>();
  for (const model of rows) {
    const list = groups.get(model.vendor) ?? [];
    list.push(model);
    groups.set(model.vendor, list);
  }

  return [...groups].map(([vendor, list]) => ({ vendor, models: list }));
}

/** The wildcard a version's "Any model" cell shows: the typed one, else any type. */
export function wildcardOf(
  rules: readonly PricingRule[],
  type: AiRequestType,
): PricingRule | null {
  return (
    rules.find((rule) => rule.modelSlug == null && rule.requestType === type) ??
    rules.find((rule) => rule.modelSlug == null && rule.requestType == null) ??
    null
  );
}

/** `<licenseSlug>~<modelSlug>` or `<licenseSlug>~*`, as the URL carries the open cell. */
export function parseCell(cell: string | undefined): CellRef | null {
  if (!cell) {
    return null;
  }
  const [licenseSlug, model, ...rest] = cell.split('~');
  if (!licenseSlug || !model || rest.length > 0) {
    return null;
  }

  return {
    licenseSlug,
    modelSlug: model === WILDCARD_CELL_MODEL ? null : model,
  };
}

export function formatCell(ref: CellRef): string {
  return rateCardCellOf(ref.licenseSlug, ref.modelSlug);
}

export function isSameCell(a: CellRef | null, b: CellRef | null): boolean {
  return (
    a !== null &&
    b !== null &&
    a.licenseSlug === b.licenseSlug &&
    a.modelSlug === b.modelSlug
  );
}
