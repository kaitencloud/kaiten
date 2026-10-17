import { Button } from '@/components/ui/button';
import { Navigate, useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TableCard } from '@/functionals/table';
import { useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import {
  buildInstanceEntitlementGroupOptions,
  filterEntitlementsRowsByGroup,
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
import { UsageHistoryDrawer } from './usage-history';

// The same object on every render, for a tab opened with no period.
const NO_PERIOD: UsageHistoryRange = {};

type InstanceDetailEntitlementsTabProps = {
  /** The slug of the entitlement whose usage history the URL opens (`?history=`). */
  historyParam?: string;
  /** The period of that history, as the URL holds it (`?from=` and `?to=`); open ends are the API's defaults. */
  historyRange?: UsageHistoryRange;
};

export const InstanceDetailEntitlementsTab = ({
  historyParam,
  historyRange = NO_PERIOD,
}: InstanceDetailEntitlementsTabProps) => {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const router = useRouter();
  const navigate = useNavigate();
  const EntitlementIcon = dataModelIcons.entitlement;
  const { entitlementsRows, instance } = useInstanceDetail();
  const instanceSlug = instance.slug ?? instance.id;
  const [groupFilter, setGroupFilter] = useState('all');
  // The history is read with the scope of the instances, which the page itself
  // needs: a session that lacks it is not offered what it would be refused.
  const canViewHistory = useCanPerform('usageHistory.list');
  const columns = useEntitlementsColumns(
    locale,
    canViewHistory ? { history: { instanceSlug } } : undefined,
  );
  const historyRow = findHistoryRow(entitlementsRows, historyParam);

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

      {historyRow?.entitlementSlug ? (
        <UsageHistoryDrawer
          entitlementName={historyRow.entitlementName}
          entitlementSlug={historyRow.entitlementSlug}
          instanceName={instance.name}
          instanceSlug={instanceSlug}
          // The drawer drops with it the period it was read for.
          onClose={() =>
            void navigate({
              params: { instanceSlug },
              search: (previous) => ({
                ...previous,
                from: undefined,
                history: undefined,
                to: undefined,
              }),
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
        />
      ) : null}
      {historyParam !== undefined && !historyRow ? (
        // A link to a history that is not one (a flag, an entitlement the instance
        // does not have): the page opens as it is, with no drawer.
        <Navigate
          params={{ instanceSlug }}
          replace
          search={(previous) => ({
            ...previous,
            from: undefined,
            history: undefined,
            to: undefined,
          })}
          to="/customers/instances/$instanceSlug/entitlements"
        />
      ) : null}
    </div>
  );
};
