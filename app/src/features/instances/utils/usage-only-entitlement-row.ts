import type { Entitlement, EntitlementUsage } from '@/api-client';
import type { InstanceEntitlementRow } from './instance-detail-entitlements.utils';

/** What the catalogue of entitlements says of each, by slug. */
export type CatalogueLookups = {
  iconBySlug: ReadonlyMap<string, string | null>;
  nameBySlug: ReadonlyMap<string, string>;
  typeBySlug: ReadonlyMap<string, NonNullable<Entitlement['type']>>;
};

const ROW_TYPES = {
  boolean: 'BOOLEAN',
  number: 'NUMBER',
  object: 'CONFIG',
} as const;

/**
 * The row of an entitlement the instance has a usage for and its license grants no
 * value of: the add-ons it holds are what grant it (`source` is `addon`), and so the
 * row is read off the usage alone. The catalogue names it, by the slug the usage
 * carries; without a catalogue entry the slug does, and without a slug its id.
 *
 * The usage is the effective entitlement, so its `limit` is the cap and its
 * `limitCapExceededOveragePercent` the percent, as for a row the license grants.
 */
export function buildUsageOnlyRow(
  usage: EntitlementUsage,
  { iconBySlug, nameBySlug, typeBySlug }: CatalogueLookups,
): InstanceEntitlementRow {
  const slug = usage.entitlementSlug || null;
  const type = ROW_TYPES[usage.value?.type ?? 'number'] ?? 'NUMBER';

  return {
    entitlementId: usage.entitlementId,
    entitlementGroups: [],
    entitlementIcon: slug ? (iconBySlug.get(slug) ?? null) : null,
    entitlementName:
      (slug ? nameBySlug.get(slug) : undefined) ?? slug ?? usage.entitlementId,
    entitlementSlug: slug,
    entitlementType: type,
    catalogueEntitlementType: slug ? (typeBySlug.get(slug) ?? null) : null,
    value: usage.value?.type === 'number' ? (usage.value.value as number) : 0,
    currentPeriodStart: usage.currentPeriodStart ?? null,
    currentPeriodEnd: usage.currentPeriodEnd ?? null,
    threshold:
      usage.limit?.type === 'number' ? (usage.limit.value as number) : null,
    limitCapExceededOveragePercent:
      usage.limitCapExceededOveragePercent ?? null,
    enabled:
      usage.value?.type === 'boolean' ? (usage.value.value as boolean) : null,
    source: usage.source ?? 'license',
    provenance: usage.provenance ?? null,
  };
}
