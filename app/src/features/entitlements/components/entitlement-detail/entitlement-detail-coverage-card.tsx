import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { AlertCountCell } from './alert-count-cell';
import {
  formatUsageRatio,
  type CustomerAggregate,
  useEntitlementDetailContext,
} from './entitlement-detail-context';

// Per-customer impact, alerts and peak usage of the entitlement, shown at the
// foot of the Usage tab.
export function EntitlementDetailCoverageCard() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';
  const router = useRouter();
  const CustomerIcon = dataModelIcons.customer;
  const { customerAggregates } = useEntitlementDetailContext();
  const getCustomerPath = (customer: CustomerAggregate) =>
    customer.customerSlug
      ? router.buildLocation({
          to: '/customers/$customerSlug',
          params: { customerSlug: customer.customerSlug },
        }).pathname
      : undefined;
  const columns = useMemo<ColumnDef<(typeof customerAggregates)[number]>[]>(
    () => [
      {
        accessorKey: 'customerName',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.customer',
          'Customer',
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.customerName}</span>
        ),
      },
      {
        accessorKey: 'impactedInstances',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.impactedInstances',
          'Impacted instances',
        ),
        cell: ({ row }) =>
          row.original.impactedInstances.toLocaleString(locale),
      },
      {
        accessorKey: 'nearLimitCount',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.near',
          'Near',
        ),
        cell: ({ row }) => (
          <AlertCountCell
            locale={locale}
            tone="warning"
            value={row.original.nearLimitCount}
          />
        ),
      },
      {
        accessorKey: 'overLimitCount',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.over',
          'Over',
        ),
        cell: ({ row }) => (
          <AlertCountCell
            locale={locale}
            tone="destructive"
            value={row.original.overLimitCount}
          />
        ),
      },
      {
        accessorKey: 'maxRatio',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.maxUsage',
          'Max usage',
        ),
        cell: ({ row }) => formatUsageRatio(row.original.maxRatio, locale),
      },
      {
        accessorKey: 'mostExposedLicense',
        header: t(
          'Pages.Entitlements.Detail.Customers.coverageTable.columns.mostExposedLicense',
          'Most exposed license',
        ),
      },
    ],
    [locale, t],
  );

  return (
    <TableCard>
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <CustomerIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle className="text-lg">
              {t(
                'Pages.Entitlements.Detail.Customers.coverageTable.title',
                'Coverage by Customer',
              )}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t(
                'Pages.Entitlements.Detail.Customers.coverageTable.description',
                'Per-customer impact, alerts and maximum observed saturation.',
              )}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>
      <TableCard.Table
        columns={columns}
        data={customerAggregates}
        variant="simple"
        getPath={getCustomerPath}
        linkColumnId="customerName"
        emptyMessage={t(
          'Pages.Entitlements.Detail.Customers.coverageTable.empty',
          'No customer coverage data for this entitlement.',
        )}
      />
    </TableCard>
  );
}
