import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Navigate, useNavigate, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TableCard } from '@/functionals/table';
import {
  getMaximumAllowedUsage,
  getUsagePercentage,
  getUsageStatus,
  getUsageStatusTone,
  isUnlimitedThreshold,
  isUsageAtRisk,
  UsageMeter,
  UsageStatusBadge,
} from '@/domains/entitlement-usage';
import { useCanPerform } from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatUsageWindowBound } from '@/lib/detail';
import {
  buildInstanceEntitlementGroupOptions,
  filterEntitlementsRowsByGroup,
  getEntitlementsMetrics,
} from '../../../../utils/instance-detail-entitlements.utils';
import type { UsageHistoryRange } from '../../../../queries';
import { findHistoryRow } from '../../../../utils/usage-history.utils';
import { EntitlementGroupFilterSelect } from '../../entitlement-group-filter-select';
import { useInstanceDetail } from '../../instance-detail-context';
import {
  type InstanceEntitlementRow,
  SoftLimitHint,
  useEntitlementsColumns,
} from './instance-detail-entitlements-columns';
import { UsageHistoryDrawer } from './usage-history';

type InstanceEntitlementsMetrics = ReturnType<
  typeof useInstanceDetail
>['entitlementsMetrics'];

type NumberEntitlement =
  InstanceEntitlementsMetrics['numberEntitlements'][number];

// Per row rather than as a card-wide caption: each entitlement carries its own
// cadence, and a LICENSE_START anchor phases the window off the instance's own
// license start date, so two meters on the same instance rarely share bounds.
// One caption would therefore be right for at most one bar and quietly wrong
// for the others. Absent bounds mean a lifetime counter, not missing data --
// and the card only ever renders NUMBER entitlements, so unlike the table
// column beside it there is no non-numeric case to exclude here.
const getUsageWindowLabel = (
  entitlement: NumberEntitlement,
  locale: string,
  t: ReturnType<typeof useTranslation>['t'],
) => {
  const { currentPeriodEnd, currentPeriodStart } = entitlement;

  if (!currentPeriodStart || !currentPeriodEnd) {
    // Shares the table column's key rather than owning a second one: the two
    // sit on the same tab, so a separate string would only be a way to drift.
    return t('Pages.Customers.Instances.Detail.entitlements.lifetime');
  }

  return t(
    'Pages.Customers.Instances.Detail.entitlements.usage.currentWindow',
    {
      end: formatUsageWindowBound(currentPeriodEnd, locale),
      start: formatUsageWindowBound(currentPeriodStart, locale),
    },
  );
};

function EntitlementsUsageCard({
  entitlementsMetrics,
  locale,
}: {
  entitlementsMetrics: InstanceEntitlementsMetrics;
  locale: string;
}) {
  const { t } = useTranslation();
  const renderUsageRow = (entitlement: NumberEntitlement) => {
    // The percentage measures what the grant permits, so the granted figure
    // beside it needs its allowance spelled out or the two read as one
    // contradictory fraction. The meter draws the grant and the allowance
    // apart, and the figures take the colour of the same status it shows.
    const maximumAllowedUsage = getMaximumAllowedUsage(
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const percentage = getUsagePercentage(
      entitlement.value,
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const status = getUsageStatus(
      entitlement.value,
      entitlement.threshold,
      entitlement.limitCapExceededOveragePercent,
    );
    const tone = getUsageStatusTone(status);

    return (
      <div key={entitlement.entitlementId} className="space-y-2">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {entitlement.entitlementName}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`text-sm font-medium ${tone.text}`}>
                {entitlement.value.toLocaleString(locale)}
              </span>
              <span className="text-sm text-muted-foreground">/</span>
              <span className="text-sm text-muted-foreground">
                {entitlement.threshold === null
                  ? '-'
                  : isUnlimitedThreshold(entitlement.threshold)
                    ? t(
                        'Pages.Customers.Instances.Detail.entitlements.unlimited',
                      )
                    : entitlement.threshold.toLocaleString(locale)}
              </span>
              <SoftLimitHint locale={locale} row={entitlement} t={t} />
              {maximumAllowedUsage === null ? null : (
                <span className={`text-xs font-medium ${tone.text}`}>
                  ({percentage}%)
                </span>
              )}
              {isUsageAtRisk(status) ? (
                <UsageStatusBadge status={status} />
              ) : null}
            </div>
          </div>
          {/* Full width rather than beside the name: the UTC bounds are long
              enough to wrap into a four-line column on a phone otherwise. */}
          <span className="block text-xs text-muted-foreground">
            {getUsageWindowLabel(entitlement, locale, t)}
          </span>
        </div>
        <UsageMeter
          limitCapExceededOveragePercent={
            entitlement.limitCapExceededOveragePercent
          }
          threshold={entitlement.threshold}
          value={entitlement.value}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Pages.Customers.Instances.Detail.entitlements.usage.title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Customers.Instances.Detail.entitlements.usage.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entitlementsMetrics.numberEntitlements.length > 0 ? (
          <div className="space-y-4 lg:space-y-6">
            {entitlementsMetrics.numberEntitlements.map(renderUsageRow)}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {t('Pages.Customers.Instances.Detail.entitlements.empty')}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

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
          to: '/entitlements/$entitlementSlug',
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
