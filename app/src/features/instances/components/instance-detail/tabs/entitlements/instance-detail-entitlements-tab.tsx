import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { listUsageReportsOptions } from '@/api-client/@tanstack/react-query.gen';
import { Navigate, useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExceptionsCard } from '../../../../entitlement-exceptions/exceptions-card';
import { TableCard } from '@/functionals/table';
import { useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  buildInstanceEntitlementGroupOptions,
  filterEntitlementsRowsByGroup,
  findResourcesRow,
  getEntitlementsMetrics,
} from '../../../../utils/instance-detail-entitlements.utils';
import type { UsageHistoryRange } from '../../../../queries';
import { findHistoryRow } from '../../../../utils/usage-history.utils';
import { EntitlementGroupFilterSelect } from '../../entitlement-group-filter-select';
import { useInstanceDetail } from '../../instance-detail-context';
import { EntitlementsUsageCard } from './entitlements-usage-card';
import {
  type InstanceEntitlementRow,
  useEntitlementsColumns,
} from './instance-detail-entitlements-columns';
import { EntitlementResourcesDrawer } from './resources';
import { UsageHistoryDrawer } from './usage-history';

// The same object on every render, for a tab opened with no period.
const NO_PERIOD: UsageHistoryRange = {};

type InstanceDetailEntitlementsTabProps = {
  /** The slug of the entitlement whose usage history the URL opens (`?history=`). */
  historyParam?: string;
  /** The period of that history, as the URL holds it (`?from=` and `?to=`); open ends are the API's defaults. */
  historyRange?: UsageHistoryRange;
  /** The one resource that history is narrowed to (`?resource=`), for an entitlement that counts per resource. */
  historyResource?: string;
  /** The slug of the entitlement whose resources the URL lists (`?resources=`). */
  resourcesParam?: string;
};

export const InstanceDetailEntitlementsTab = ({
  historyParam,
  historyRange = NO_PERIOD,
  historyResource,
  resourcesParam,
}: InstanceDetailEntitlementsTabProps) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const router = useRouter();
  const navigate = useNavigate();
  const EntitlementIcon = dataModelIcons.entitlement;
  const { entitlementsRows, canonicalEntitlementsRows, instance } =
    useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const [groupFilter, setGroupFilter] = useState('all');
  // The history is read with the scope of the instances, which the page itself
  // needs: a session that lacks it is not offered what it would be refused.
  const canViewHistory = useCanPerform('usageHistory.list');
  // The same for the resources of an entitlement that counts per resource.
  const canListResources = useCanPerform('entitlementResources.list');
  const columns = useEntitlementsColumns(locale, {
    history: canViewHistory ? { instanceSlug } : undefined,
    resources: canListResources ? { instanceSlug } : undefined,
  });
  const resourcesRow = canListResources
    ? findResourcesRow(
        canonicalEntitlementsRows ?? entitlementsRows,
        resourcesParam,
      )
    : undefined;
  const historyRow = findHistoryRow(
    canonicalEntitlementsRows ?? entitlementsRows,
    historyParam,
  );
  // Financial journal links may name hidden or deleted live resources. Do not fetch
  // operational AI definitions to recover a label: the journal authorizes the read.
  const liveTarget = (canonicalEntitlementsRows ?? entitlementsRows).find(
    (row) => row.entitlementSlug === historyParam,
  );
  const needsEvidence =
    canViewHistory && Boolean(historyParam) && !liveTarget;
  const evidence = useQuery({
    ...listUsageReportsOptions({
      path: { instanceSlug, entitlementSlug: historyParam ?? '' },
      // Resolve the journal independently of the selected period. The API
      // resolves the tenant-scoped pair before filtering (unknown pairs are 404).
      query: { limit: 1 },
    }),
    enabled: needsEvidence,
    retry: false,
  });
  // A successful financial read proves the pair even when this period is empty.
  const hasEvidence = evidence.isSuccess;
  const evidencePending = needsEvidence && evidence.isPending;
  const evidenceSlug =
    canViewHistory &&
    historyParam &&
    (historyRow || (needsEvidence && hasEvidence))
      ? historyParam
      : undefined;

  const getEntitlementPath = (entitlement: InstanceEntitlementRow) =>
    entitlement.entitlementSlug
      ? router.buildLocation({
          to: '/catalog/entitlements/$entitlementSlug',
          params: { entitlementSlug: entitlement.entitlementSlug },
        }).pathname
      : undefined;
  const groupOptions = useMemo(
    () => buildInstanceEntitlementGroupOptions(entitlementsRows),
    [entitlementsRows],
  );
  const filteredEntitlementsRows = useMemo(
    () => filterEntitlementsRowsByGroup(entitlementsRows, groupFilter),
    [entitlementsRows, groupFilter],
  );
  const filteredEntitlementsMetrics = useMemo(
    () => getEntitlementsMetrics(filteredEntitlementsRows),
    [filteredEntitlementsRows],
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <EntitlementGroupFilterSelect
          ariaLabel={t(
            'Pages.Customers.Instances.Detail.entitlements.filters.groupLabel',
          )}
          allGroupsLabel={t(
            'Pages.Customers.Instances.Detail.entitlements.filters.allGroups',
          )}
          options={groupOptions}
          value={groupFilter}
          onChange={setGroupFilter}
        />
        {groupFilter !== 'all' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setGroupFilter('all')}
          >
            {t('Pages.Customers.Instances.Detail.entitlements.filters.clear')}
          </Button>
        ) : null}
      </div>
      <EntitlementsUsageCard
        entitlementsMetrics={filteredEntitlementsMetrics}
        locale={locale}
      />

      <TableCard>
        <TableCard.Header>
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <EntitlementIcon />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle>
                {t('Pages.Customers.Instances.Detail.entitlements.table.title')}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t(
                  'Pages.Customers.Instances.Detail.entitlements.table.description',
                )}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
        </TableCard.Header>
        <TableCard.Table
          columns={columns}
          data={filteredEntitlementsRows}
          emptyMessage={t(
            'Pages.Customers.Instances.Detail.entitlements.empty',
          )}
          getPath={getEntitlementPath}
          linkColumnId="entitlementName"
          variant="simple"
        />
      </TableCard>

      <ExceptionsCard />
      {evidenceSlug ? (
        <UsageHistoryDrawer
          entitlementName={historyRow?.entitlementName ?? evidenceSlug}
          entitlementSlug={evidenceSlug}
          instanceName={instance.name}
          instanceSlug={instanceSlug}
          // The drawer drops with it the period it was read for, and the resource.
          onClose={() =>
            void navigate({
              params: { instanceSlug },
              search: (previous) => ({
                ...previous,
                from: undefined,
                history: undefined,
                resource: undefined,
                to: undefined,
              }),
              to: '/customers/instances/$instanceSlug/entitlements',
            })
          }
          onClearResource={() =>
            void navigate({
              params: { instanceSlug },
              replace: true,
              search: (previous) => ({ ...previous, resource: undefined }),
              to: '/customers/instances/$instanceSlug/entitlements',
            })
          }
          // Writing the period to the URL makes the drawer read it from there.
          onRangeChange={(range) =>
            void navigate({
              params: { instanceSlug },
              replace: true,
              search: (previous) => ({ ...previous, ...range }),
              to: '/customers/instances/$instanceSlug/entitlements',
            })
          }
          range={historyRange}
          resource={historyResource}
        />
      ) : null}
      {resourcesRow ? (
        <EntitlementResourcesDrawer
          canViewHistory={canViewHistory}
          entitlementName={resourcesRow.entitlementName}
          entitlementSlug={resourcesParam ?? ''}
          instanceName={instance.name}
          instanceSlug={instanceSlug}
          limit={resourcesRow}
          locale={locale}
          onClose={() =>
            void navigate({
              params: { instanceSlug },
              search: (previous) => ({ ...previous, resources: undefined }),
              to: '/customers/instances/$instanceSlug/entitlements',
            })
          }
        />
      ) : null}
      {resourcesParam !== undefined && !resourcesRow ? (
        // A link to a list that is not one (a counter of the instance, an entitlement it does
        // not have, a session that may not list them): the page opens as it is, with no drawer.
        <Navigate
          params={{ instanceSlug }}
          replace
          search={(previous) => ({ ...previous, resources: undefined })}
          to="/customers/instances/$instanceSlug/entitlements"
        />
      ) : null}
      {historyParam !== undefined && !evidenceSlug && !evidencePending ? (
        // A link to a history that is not one (a flag, an entitlement the instance
        // does not have): the page opens as it is, with no drawer.
        <Navigate
          params={{ instanceSlug }}
          replace
          search={(previous) => ({
            ...previous,
            from: undefined,
            history: undefined,
            resource: undefined,
            to: undefined,
          })}
          to="/customers/instances/$instanceSlug/entitlements"
        />
      ) : null}
    </div>
  );
};
