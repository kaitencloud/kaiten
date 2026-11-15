import { createContext, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AddonGrantsState,
  PoolVersionSummary,
} from '@/domains/ai-credits';
import { TableCard, type ColumnDef } from '@/functionals/table';
import {
  PoolCostCell,
  PoolGrantCell,
  PoolRateCardLink,
  PoolVersionCell,
  PoolWildcardCell,
} from './pool-pricing-cells';

type PoolPricingTableProps = {
  /** The add-on grants of the pool, by licence family, as far as they are read. */
  addonGrants?: ReadonlyMap<string, AddonGrantsState>;
  poolName: string;
  poolSlug: string;
  rows: PoolVersionSummary[];
  /** The version named by `?version=`, highlighted. */
  selectedVersion?: string;
};

/**
 * What the grant cells read beside their row. In a context, not in the
 * columns: the add-on grants arrive after the rows, and new columns would
 * draw every cell of the table again.
 */
const PoolGrantsContext = createContext<
  Pick<PoolPricingTableProps, 'addonGrants' | 'poolName'>
>({ poolName: '' });

function GrantCell({ row }: { row: PoolVersionSummary }) {
  const { addonGrants, poolName } = useContext(PoolGrantsContext);

  return (
    <PoolGrantCell
      addons={addonGrants?.get(row.familySlug)}
      poolName={poolName}
      row={row}
    />
  );
}

function usePoolPricingColumns(
  poolSlug: string,
): ColumnDef<PoolVersionSummary>[] {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        id: 'version',
        header: t('AI.Pool.columns.version'),
        cell: ({ row }) => <PoolVersionCell row={row.original} />,
      },
      {
        id: 'grant',
        header: t('AI.Pool.columns.grant'),
        cell: ({ row }) => <GrantCell row={row.original} />,
      },
      {
        id: 'rules',
        header: t('AI.Pool.columns.rules'),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.rulesCount}</span>
        ),
      },
      {
        id: 'models',
        header: t('AI.Pool.columns.models'),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.modelsPriced}</span>
        ),
      },
      {
        id: 'wildcard',
        header: t('AI.Pool.columns.wildcard'),
        cell: ({ row }) => <PoolWildcardCell row={row.original} />,
      },
      {
        id: 'costPerCredit',
        header: t('AI.Pool.columns.costPerCredit'),
        cell: ({ row }) => <PoolCostCell row={row.original} />,
      },
      {
        id: 'actions',
        header: t('AI.Pool.columns.actions'),
        cell: ({ row }) => (
          <PoolRateCardLink poolSlug={poolSlug} row={row.original} />
        ),
      },
    ],
    [t, poolSlug],
  );
}

/** One row per licence version; archived versions are dimmed, not hidden. */
export function PoolPricingTable({
  addonGrants,
  poolName,
  poolSlug,
  rows,
  selectedVersion,
}: PoolPricingTableProps) {
  const { t } = useTranslation();
  const columns = usePoolPricingColumns(poolSlug);
  const grants = useMemo(
    () => ({ addonGrants, poolName }),
    [addonGrants, poolName],
  );
  function rowClassName(row: PoolVersionSummary) {
    // Cells, not the row: the table paints every row with its own background.
    if (row.licenseSlug === selectedVersion) return '[&>td]:bg-accent';
    return row.archived ? 'text-muted-foreground' : undefined;
  }
  return (
    <section aria-label={t('AI.Pool.tableLabel')}>
      <PoolGrantsContext.Provider value={grants}>
        <TableCard className="shadow-none">
          <TableCard.Table
            data={rows}
            columns={columns}
            getRowClassName={rowClassName}
            emptyMessage={t('AI.Pool.emptyTitle')}
          />
        </TableCard>
      </PoolGrantsContext.Provider>
    </section>
  );
}
