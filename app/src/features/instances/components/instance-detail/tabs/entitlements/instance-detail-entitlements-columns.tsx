import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EntityIcon } from '@/components/ui/icon';
import { CheckCircle, History, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getHighestAcceptedUsage,
  getUsageStatus,
  isSoftLimit,
  isUnlimitedThreshold,
  UsageMeter,
  UsageStatusBadge,
} from '@/domains/entitlement-usage';
import type { ColumnDef } from '@/functionals/table';
import { formatUsageWindowBound } from '@/lib/detail';
import type { useInstanceDetail } from '../../instance-detail-context';

export type InstanceEntitlementRow = ReturnType<
  typeof useInstanceDetail
>['entitlementsRows'][number];

type EntitlementColumn = ColumnDef<InstanceEntitlementRow>;
type TranslateFn = ReturnType<typeof useTranslation>['t'];

function buildNameColumn(t: TranslateFn): EntitlementColumn {
  return {
    accessorKey: 'entitlementName',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.entitlement',
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <EntityIcon
          token={row.original.entitlementIcon}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="font-medium">{row.original.entitlementName}</span>
      </div>
    ),
  };
}

function buildTypeColumn(t: TranslateFn): EntitlementColumn {
  return {
    accessorKey: 'entitlementType',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.type',
    ),
    cell: ({ row }) => (
      <Badge
        variant={
          row.original.entitlementType === 'NUMBER' ? 'outline' : 'secondary'
        }
      >
        {t(
          `Pages.Entitlements.EntitlementTypes.${
            row.original.catalogueEntitlementType ??
            row.original.entitlementType
          }`,
        )}
      </Badge>
    ),
  };
}

function buildUsageColumn(t: TranslateFn, locale: string): EntitlementColumn {
  return {
    accessorKey: 'value',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.usage',
    ),
    // A figure column, so flush right: the meters share one width and line up
    // whatever the length of the number beside them.
    meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
    cell: ({ row }) => {
      if (row.original.entitlementType === 'BOOLEAN') {
        return row.original.value > 0 ? (
          <CheckCircle className="ml-auto size-4 text-success-subtle-foreground" />
        ) : (
          <XCircle className="ml-auto size-4 text-muted-foreground" />
        );
      }

      if (row.original.entitlementType === 'CONFIG') {
        return <span className="text-sm text-muted-foreground">-</span>;
      }

      return (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm font-medium tabular-nums">
            {row.original.value.toLocaleString(locale)}
          </span>
          <UsageMeter
            className="w-16"
            limitCapExceededOveragePercent={
              row.original.limitCapExceededOveragePercent
            }
            size="sm"
            threshold={row.original.threshold}
            value={row.original.value}
          />
        </div>
      );
    },
  };
}

// A soft limit still grants `threshold`; the percentage is how far past it the
// API keeps accepting usage. Showing only the granted figure would read as a
// hard cap, which is what the usage bar used to imply. Renders nothing for a
// grant that has no overage to announce, so no caller has to remember to ask.
export function SoftLimitHint({
  locale,
  row,
  t,
}: {
  locale: string;
  row: Pick<
    InstanceEntitlementRow,
    'limitCapExceededOveragePercent' | 'threshold'
  >;
  t: TranslateFn;
}) {
  const highestAcceptedUsage = getHighestAcceptedUsage(
    row.threshold,
    row.limitCapExceededOveragePercent,
  );

  if (
    highestAcceptedUsage === null ||
    !isSoftLimit(row.threshold, row.limitCapExceededOveragePercent)
  ) {
    return null;
  }

  return (
    <span
      className="text-xs text-muted-foreground"
      title={t(
        'Pages.Customers.Instances.Detail.entitlements.softLimitDescription',
        { max: highestAcceptedUsage.toLocaleString(locale) },
      )}
    >
      {t('Pages.Customers.Instances.Detail.entitlements.softLimitHint', {
        percent: row.limitCapExceededOveragePercent,
      })}
    </span>
  );
}

function buildThresholdColumn(
  t: TranslateFn,
  locale: string,
): EntitlementColumn {
  return {
    accessorKey: 'threshold',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.threshold',
    ),
    cell: ({ row }) => (
      <span className="flex items-baseline gap-1 text-sm text-muted-foreground">
        <span>
          {row.original.entitlementType === 'BOOLEAN' ||
          row.original.entitlementType === 'CONFIG' ||
          row.original.threshold === null
            ? '-'
            : isUnlimitedThreshold(row.original.threshold)
              ? t('Pages.Customers.Instances.Detail.entitlements.unlimited')
              : row.original.threshold.toLocaleString(locale)}
        </span>
        <SoftLimitHint locale={locale} row={row.original} t={t} />
      </span>
    ),
  };
}

// The window is phased per instance when the entitlement anchors on
// LICENSE_START, so these bounds only mean anything next to a given instance's
// usage -- which is exactly where this column sits. Absent bounds mean a
// lifetime counter, not missing data.
function buildCurrentPeriodColumn(
  t: TranslateFn,
  locale: string,
): EntitlementColumn {
  return {
    accessorKey: 'currentPeriodStart',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.currentPeriod',
    ),
    cell: ({ row }) => {
      const { currentPeriodStart, currentPeriodEnd, entitlementType } =
        row.original;

      // A window is a counter notion; BOOLEAN and CONFIG have no counter, so
      // they get the same dash the threshold column gives them rather than
      // being labelled lifetime counters.
      if (entitlementType !== 'NUMBER') {
        return <span className="text-sm text-muted-foreground">-</span>;
      }

      if (!currentPeriodStart || !currentPeriodEnd) {
        return (
          <span className="text-sm text-muted-foreground">
            {t('Pages.Customers.Instances.Detail.entitlements.lifetime')}
          </span>
        );
      }

      return (
        <span className="whitespace-nowrap text-muted-foreground text-xs">
          {t('Pages.Customers.Instances.Detail.entitlements.periodRange', {
            start: formatUsageWindowBound(currentPeriodStart, locale),
            end: formatUsageWindowBound(currentPeriodEnd, locale),
          })}
        </span>
      );
    },
  };
}

function buildStatusColumn(t: TranslateFn): EntitlementColumn {
  return {
    accessorKey: 'enabled',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.status',
    ),
    cell: ({ row }) =>
      // A counter's status is where its usage stands against the grant; only
      // the on/off grants have an enabled flag to show instead.
      row.original.entitlementType === 'NUMBER' &&
      row.original.threshold !== null ? (
        <UsageStatusBadge
          status={getUsageStatus(
            row.original.value,
            row.original.threshold,
            row.original.limitCapExceededOveragePercent,
          )}
        />
      ) : row.original.enabled === true ? (
        <Badge variant="success">
          {t('Pages.Customers.Instances.Detail.entitlements.status.enabled')}
        </Badge>
      ) : row.original.enabled === false ? (
        <Badge variant="outline">
          {t('Pages.Customers.Instances.Detail.entitlements.status.disabled')}
        </Badge>
      ) : (
        <Badge variant="secondary">
          {t('Pages.Customers.Instances.Detail.entitlements.status.unknown')}
        </Badge>
      ),
  };
}

// The usage reports are a counter's: a flag or a configuration reports none. The
// link opens the drawer the URL controls, over the tab, and a click on the row
// elsewhere still leads to the entitlement.
function buildHistoryColumn(
  t: TranslateFn,
  instanceSlug: string,
): EntitlementColumn {
  return {
    id: 'history',
    header: t(
      'Pages.Customers.Instances.Detail.entitlements.table.headers.history',
    ),
    enableSorting: false,
    cell: ({ row }) =>
      row.original.entitlementType === 'NUMBER' &&
      row.original.entitlementSlug ? (
        <Button
          aria-label={t(
            'Pages.Customers.Instances.Detail.entitlements.history.openLabel',
            { entitlement: row.original.entitlementName },
          )}
          nativeButton={false}
          render={
            <Link
              params={{ instanceSlug }}
              search={{ history: row.original.entitlementSlug }}
              to="/customers/instances/$instanceSlug/entitlements"
            >
              <History className="size-4" />
              {t('Pages.Customers.Instances.Detail.entitlements.history.open')}
            </Link>
          }
          role="link"
          size="sm"
          variant="ghost"
        />
      ) : null,
  };
}

type EntitlementsColumnsOptions = {
  /**
   * Where the history of an entitlement is opened, which is the instance the
   * table is of: left out, the table offers no history (the session may not read
   * it, and is not offered what it would be refused).
   */
  history?: { instanceSlug: string };
};

export const useEntitlementsColumns = (
  locale: string,
  { history }: EntitlementsColumnsOptions = {},
) => {
  const { t } = useTranslation();
  const historySlug = history?.instanceSlug;

  return useMemo<EntitlementColumn[]>(
    () => [
      buildNameColumn(t),
      buildTypeColumn(t),
      buildUsageColumn(t, locale),
      buildThresholdColumn(t, locale),
      buildCurrentPeriodColumn(t, locale),
      buildStatusColumn(t),
      ...(historySlug === undefined
        ? []
        : [buildHistoryColumn(t, historySlug)]),
    ],
    [historySlug, locale, t],
  );
};
