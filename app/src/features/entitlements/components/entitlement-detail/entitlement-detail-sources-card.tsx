import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { EntityIcon } from '@/components/ui/icon';
import { type ColumnDef, TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDecimalQuantity } from '@/lib/decimal';
import { entitlementsQueryOptions } from '../../queries';

type SourceRow = {
  entitlementSlug: string;
  icon?: string;
  name: string;
  unit?: string;
  weight: string;
};

/**
 * What the sources of a combined entitlement are, as the catalogue names them: the
 * rate each is summed at, and the unit it is counted in. A source the catalogue does
 * not hold (not read yet, or out of reach of the session) is named by its slug.
 */
function useSourceRows(entitlement: Entitlement): SourceRow[] {
  const catalogue = useQuery(entitlementsQueryOptions);
  const items = catalogue.data?.items;

  return useMemo(() => {
    const bySlug = new Map(
      (items ?? []).flatMap((item) => (item.slug ? [[item.slug, item]] : [])),
    );

    return (entitlement.sources ?? []).map(({ entitlementSlug, weight }) => {
      const source = bySlug.get(entitlementSlug);

      return {
        entitlementSlug,
        icon: source?.icon,
        name: source?.name ?? entitlementSlug,
        unit: source?.unitPlural,
        weight: weight ?? '1',
      };
    });
  }, [entitlement.sources, items]);
}

/**
 * The entitlements a combined entitlement sums, with their weights. The sum is
 * computed when it is read, for display only: nothing is stored for it and nothing
 * is enforced on it, which the card says before anyone looks for a limit to set.
 */
export function EntitlementDetailSourcesCard({
  entitlement,
}: {
  entitlement: Entitlement;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const EntitlementIcon = dataModelIcons.entitlement;
  const rows = useSourceRows(entitlement);
  const columns = useMemo<ColumnDef<SourceRow>[]>(
    () => [
      {
        accessorKey: 'name',
        enableSorting: false,
        header: t('Pages.Entitlements.Detail.Overview.sources.columns.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <EntityIcon
              token={row.original.icon}
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="font-medium">{row.original.name}</span>
          </span>
        ),
      },
      {
        accessorKey: 'entitlementSlug',
        enableSorting: false,
        header: t('Pages.Entitlements.Detail.Overview.sources.columns.slug'),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.entitlementSlug}
          </span>
        ),
      },
      {
        accessorKey: 'weight',
        enableSorting: false,
        header: t('Pages.Entitlements.Detail.Overview.sources.columns.weight'),
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatDecimalQuantity(row.original.weight)}
          </span>
        ),
      },
      {
        accessorKey: 'unit',
        enableSorting: false,
        header: t('Pages.Entitlements.Detail.Overview.sources.columns.unit'),
        cell: ({ row }) =>
          row.original.unit ?? <span className="text-muted-foreground">-</span>,
      },
    ],
    [t],
  );
  const getSourcePath = (row: SourceRow) =>
    router.buildLocation({
      to: '/catalog/entitlements/$entitlementSlug',
      params: { entitlementSlug: row.entitlementSlug },
    }).pathname;

  return (
    <TableCard className="xl:col-span-3">
      <TableCard.Header>
        <TableCard.HeaderLeading>
          <TableCard.HeaderIcon>
            <EntitlementIcon />
          </TableCard.HeaderIcon>
          <TableCard.HeaderHeading>
            <TableCard.HeaderTitle>
              {t('Pages.Entitlements.Detail.Overview.sources.title')}
            </TableCard.HeaderTitle>
            <TableCard.HeaderSubtitle>
              {t('Pages.Entitlements.Detail.Overview.sources.description')}
            </TableCard.HeaderSubtitle>
          </TableCard.HeaderHeading>
        </TableCard.HeaderLeading>
      </TableCard.Header>
      <TableCard.Table
        columns={columns}
        data={rows}
        emptyMessage={t('Pages.Entitlements.Detail.Overview.sources.empty')}
        getPath={getSourcePath}
        pagination={false}
        variant="simple"
      />
    </TableCard>
  );
}
