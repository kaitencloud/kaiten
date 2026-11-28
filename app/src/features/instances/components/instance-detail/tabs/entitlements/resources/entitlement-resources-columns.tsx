import { Link } from '@tanstack/react-router';
import { History } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntitlementResource } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  getUsageStatus,
  UsageMeter,
  UsageStatusBadge,
} from '@/domains/entitlement-usage';
import type { ColumnDef } from '@/functionals/table';
import type { InstanceEntitlementRow } from '../../../../../utils/instance-detail-entitlements.utils';

/** What each resource is measured against: the limit of the entitlement, which is the same for all of them. */
export type ResourceLimit = Pick<
  InstanceEntitlementRow,
  'limitCapExceededOveragePercent' | 'threshold'
>;

type ResourcesColumnsOptions = {
  entitlementName: string;
  entitlementSlug: string;
  /** Whether the session may read the usage history, which each resource links to. */
  canViewHistory: boolean;
  instanceSlug: string;
  limit: ResourceLimit;
  locale: string;
};

const counterOf = (resource: EntitlementResource) => resource.value.value;

/**
 * The columns of the list of resources: its key, how far its counter is from the limit all
 * of them share, where that leaves it, how many reports made the counter and, where the
 * session may read it, a link to the usage history narrowed to the resource.
 */
export function useEntitlementResourcesColumns({
  canViewHistory,
  entitlementName,
  entitlementSlug,
  instanceSlug,
  limit,
  locale,
}: ResourcesColumnsOptions): ColumnDef<EntitlementResource>[] {
  const { t } = useTranslation();
  const { limitCapExceededOveragePercent, threshold } = limit;

  return useMemo<ColumnDef<EntitlementResource>[]>(
    () => [
      {
        accessorKey: 'resourceKey',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.resourceKey}</span>
        ),
        enableSorting: false,
        header: t(
          'Pages.Customers.Instances.Detail.entitlements.resources.columns.resource',
        ),
        id: 'resource',
      },
      {
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm font-medium tabular-nums">
              {counterOf(row.original).toLocaleString(locale)}
            </span>
            <UsageMeter
              className="w-16"
              limitCapExceededOveragePercent={limitCapExceededOveragePercent}
              size="sm"
              threshold={threshold}
              value={counterOf(row.original)}
            />
          </div>
        ),
        enableSorting: false,
        header: t(
          'Pages.Customers.Instances.Detail.entitlements.resources.columns.usage',
        ),
        id: 'usage',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
      },
      {
        cell: ({ row }) =>
          threshold === null ? null : (
            <UsageStatusBadge
              status={getUsageStatus(
                counterOf(row.original),
                threshold,
                limitCapExceededOveragePercent,
              )}
            />
          ),
        enableSorting: false,
        header: t(
          'Pages.Customers.Instances.Detail.entitlements.resources.columns.status',
        ),
        id: 'status',
      },
      {
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {(row.original.value.event_count ?? 0).toLocaleString(locale)}
          </span>
        ),
        enableSorting: false,
        header: t(
          'Pages.Customers.Instances.Detail.entitlements.resources.columns.reports',
        ),
        id: 'reports',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
      },
      ...(canViewHistory
        ? [
            {
              cell: ({ row }) => (
                <Button
                  aria-label={t(
                    'Pages.Customers.Instances.Detail.entitlements.resources.historyLabel',
                    {
                      entitlement: entitlementName,
                      resource: row.original.resourceKey,
                    },
                  )}
                  nativeButton={false}
                  render={
                    <Link
                      params={{ instanceSlug }}
                      search={{
                        history: entitlementSlug,
                        resource: row.original.resourceKey,
                      }}
                      to="/customers/instances/$instanceSlug/entitlements"
                    >
                      <History className="size-4" />
                      {t(
                        'Pages.Customers.Instances.Detail.entitlements.history.open',
                      )}
                    </Link>
                  }
                  role="link"
                  size="sm"
                  variant="ghost"
                />
              ),
              enableSorting: false,
              header: t(
                'Pages.Customers.Instances.Detail.entitlements.table.headers.history',
              ),
              id: 'history',
            } satisfies ColumnDef<EntitlementResource>,
          ]
        : []),
    ],
    [
      canViewHistory,
      entitlementName,
      entitlementSlug,
      instanceSlug,
      limitCapExceededOveragePercent,
      locale,
      t,
      threshold,
    ],
  );
}
