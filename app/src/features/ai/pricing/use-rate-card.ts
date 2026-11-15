import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { AiUsage, Entitlement, Model } from '@/api-client';
import {
  aiRateCardQueryOptions,
  isUsableCreditValue,
  modelsQueryOptions,
  poolSettingsId,
  pricingSettingsCollection,
  referenceCallOf,
  referenceSettingsId,
  useAddonGrants,
  useAiAccess,
} from '@/domains/ai-credits';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import type { AiRequestType } from './engine';
import type { PricingSearch } from './pricing-search.schema';
import {
  type CellRef,
  creditPools,
  familiesOf,
  parseCell,
  type RateCardFamily,
  type RateCardVersion,
  requestTypeTabs,
  resolveFamily,
  type VendorGroup,
  vendorGroups,
  versionsInView,
  withAddonGrants,
} from './rate-card-model';

export type RateCardView = {
  pools: Entitlement[];
  pool: Entitlement | undefined;
  families: RateCardFamily[];
  /** `current`, or the slug of the family whose versions are the columns. */
  family: string;
  /** A version a link pointed at: its column is marked. */
  focusVersion: string | undefined;
  tabs: { type: AiRequestType; count: number }[];
  type: AiRequestType;
  reference: AiUsage;
  /** What was typed as the value of a credit, usable or not. */
  creditValueText: string;
  /** The value of a credit the margin is computed with, when usable. */
  creditValue: string | null;
  versions: RateCardVersion[];
  groups: VendorGroup[];
  /** The whole catalogue: what a wildcard covers is counted over it. */
  models: Model[];
  modelCount: number;
  /** Whether any version prices anything in this pool. */
  poolHasRules: boolean;
  /** Versions, not archived, that grant the pool, over all of them. */
  grantingVersions: number;
  liveVersions: number;
  cell: CellRef | null;
};

const EMPTY: never[] = [];

/**
 * The rate card's reads joined into what the screen shows: the pools (REST), the
 * models with their vendor costs (REST), every licence version with its grants
 * and rules (one paged graph read), what add-ons can grant on the families in
 * view (a read of its own per family, which may be refused), and what this
 * browser keeps.
 */
export function useRateCard(search: PricingSearch, enabled: boolean) {
  const access = useAiAccess();
  const poolsQuery = useQuery({
    ...allEntitlementsOptions(),
    enabled: enabled && access.allows('listEntitlements'),
  });
  const modelsQuery = useQuery({ ...modelsQueryOptions, enabled });
  const licensesQuery = useQuery({ ...aiRateCardQueryOptions, enabled });
  const { data: settings } = useLiveQuery((query) =>
    query.from({ settings: pricingSettingsCollection() }),
  );

  const pools = useMemo(
    () => creditPools(poolsQuery.data?.items ?? EMPTY),
    [poolsQuery.data],
  );
  const models: Model[] = modelsQuery.data?.items ?? EMPTY;
  const licenses = licensesQuery.data ?? EMPTY;
  const status = search.status ?? 'active';
  const q = search.q ?? '';
  const cell = parseCell(search.cell);
  const pool = pools.find((item) => item.slug === search.pool) ?? pools[0];
  const poolSlug = pool?.slug ?? '';
  const tabs = useMemo(() => requestTypeTabs(models, status), [models, status]);
  const type: AiRequestType =
    tabs.find((tab) => tab.type === search.type)?.type ??
    tabs[0]?.type ??
    'COMPLETION';
  const family = resolveFamily(
    licenses,
    search.family,
    search.version ?? cell?.licenseSlug,
  );
  const columns = useMemo(
    () => versionsInView(licenses, poolSlug, family),
    [licenses, poolSlug, family],
  );
  // What add-ons can grant is the same for every version of a family: one
  // version of each family in view is asked, in a read of its own.
  const addonTargets = useMemo(
    () =>
      [...new Map(columns.map((item) => [item.familySlug, item.slug]))].map(
        ([familySlug, licenseSlug]) => ({ familySlug, licenseSlug }),
      ),
    [columns],
  );
  const addonGrants = useAddonGrants(addonTargets, poolSlug, enabled);
  const versions = useMemo(
    () => withAddonGrants(columns, addonGrants),
    [columns, addonGrants],
  );
  const groups = useMemo(
    () => vendorGroups(models, { type, status, q }),
    [models, type, status, q],
  );
  const families = useMemo(() => familiesOf(licenses), [licenses]);
  const everyVersion = useMemo(
    () =>
      families.flatMap((item) => versionsInView(licenses, poolSlug, item.slug)),
    [families, licenses, poolSlug],
  );

  const byId = (id: string) => settings?.find((record) => record.id === id);
  const creditValueText = byId(poolSettingsId(poolSlug))?.creditValue ?? '';
  const live = everyVersion.filter((item) => item.lifecycle !== 'ARCHIVED');

  const view: RateCardView = {
    pools,
    pool,
    families,
    family,
    focusVersion: search.version,
    tabs,
    type,
    reference: referenceCallOf(byId(referenceSettingsId(type)), type),
    creditValueText,
    creditValue: isUsableCreditValue(creditValueText) ? creditValueText : null,
    versions,
    groups,
    models,
    modelCount: groups.reduce((sum, group) => sum + group.models.length, 0),
    poolHasRules: everyVersion.some((item) => item.rules.length > 0),
    grantingVersions: live.filter((item) => item.grant.granted).length,
    liveVersions: live.length,
    cell,
  };
  const queries = [poolsQuery, modelsQuery, licensesQuery];

  return {
    view,
    isPending: queries.some((query) => query.isPending),
    error: queries.find((query) => query.isError)?.error ?? null,
    retry: () => {
      for (const query of queries) {
        if (query.isError) {
          void query.refetch();
        }
      }
    },
  };
}
