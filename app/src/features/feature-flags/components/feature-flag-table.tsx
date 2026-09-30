import { Badge } from '@/components/ui/badge';
import { useRouter } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import {
  type ColumnDef,
  DataTable,
  dataTableSortableHeader,
  TableJsonDialog,
} from '@/functionals/table';
import { cn } from '@/lib/utils';
import { TargetingsListDisplay } from './targeting-display';
import { VariantsListDisplay } from './variant-display';

type FeatureFlagsTableProps = {
  featureFlags: FeatureFlag[];
  className?: string;
};

export function FeatureFlagsTable({
  featureFlags,
  className,
}: FeatureFlagsTableProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const columns = useMemo<ColumnDef<FeatureFlag>[]>(
    () => [
      {
        accessorKey: 'name',
        header: dataTableSortableHeader(
          t('Pages.FeatureFlags.Table.Columns.name', 'Name'),
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium">{row.original.name}</p>
            {row.original.slug ? (
              <p className="text-muted-foreground font-mono text-xs">
                {row.original.slug}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'type',
        enableSorting: false,
        header: t('Pages.FeatureFlags.Table.Columns.type', 'Type'),
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.type}
          </Badge>
        ),
      },
      {
        accessorKey: 'enabled',
        enableSorting: false,
        header: t('Pages.FeatureFlags.Table.Columns.enabled', 'Status'),
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? 'success' : 'secondary'}>
            <div className="flex items-center gap-1">
              {row.original.enabled
                ? t('Pages.FeatureFlags.Card.enabled', 'Enabled')
                : t('Pages.FeatureFlags.Card.disabled', 'Disabled')}
            </div>
          </Badge>
        ),
      },
      {
        accessorKey: 'variants',
        enableSorting: false,
        header: t('Pages.FeatureFlags.Table.Columns.variants', 'Variants'),
        cell: ({ row }) => (
          <VariantsListDisplay
            variants={row.original.variants}
            type={row.original.type}
          />
        ),
      },
      {
        accessorKey: 'targetings',
        enableSorting: false,
        header: t('Pages.FeatureFlags.Table.Columns.targetings', 'Targetings'),
        cell: ({ row }) => (
          <TargetingsListDisplay targetings={row.original.targetings ?? []} />
        ),
      },
      {
        accessorKey: 'metadata',
        enableSorting: false,
        header: t('Pages.FeatureFlags.Table.Columns.metadata', 'Metadata'),
        cell: ({ row }) => (
          <TableJsonDialog
            title={t('Pages.FeatureFlags.Table.Dialogs.metadataTitle')}
            description={t(
              'Pages.FeatureFlags.Table.Dialogs.metadataDescription',
            )}
            triggerAriaLabel={t(
              'Pages.FeatureFlags.Table.Dialogs.metadataTrigger',
            )}
            value={
              row.original.metadata as
                | Record<string, unknown>
                | null
                | undefined
            }
          />
        ),
      },
    ],
    [t],
  );

  const getFeatureFlagPath = (flag: FeatureFlag) =>
    flag.slug
      ? router.buildLocation({
          to: '/feature-flags/$featureFlagSlug',
          params: { featureFlagSlug: flag.slug },
        }).pathname
      : undefined;

  return (
    <DataTable
      className={cn('h-full', className)}
      columns={columns}
      data={featureFlags}
      getPath={getFeatureFlagPath}
      bodyScrollable
    />
  );
}
