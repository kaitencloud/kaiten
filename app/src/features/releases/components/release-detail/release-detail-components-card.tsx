import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '@/api-client';
import { DetailCard } from '@/functionals/detail-card';
import { type ColumnDef, DataTable } from '@/functionals/table';

type ReleaseComponentsCardProps = {
  components: Component[];
};

export function ReleaseComponentsCard({
  components,
}: ReleaseComponentsCardProps) {
  const { t } = useTranslation();
  const columns = useMemo<ColumnDef<Component>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t(
          'Pages.Releases.Detail.Overview.components.columns.name',
          'Name',
        ),
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        accessorKey: 'version',
        header: t(
          'Pages.Releases.Detail.Overview.components.columns.version',
          'Version',
        ),
        cell: ({ row }) => (
          <code className="inline-flex rounded bg-muted px-2 py-1 font-mono text-xs">
            {row.original.version}
          </code>
        ),
      },
      {
        accessorKey: 'description',
        header: t(
          'Pages.Releases.Detail.Overview.components.columns.description',
          'Description',
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.description || '—'}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <DetailCard className="lg:col-span-3">
      <DetailCard.Header>
        <DetailCard.Title>
          {t('Pages.Releases.Detail.Overview.components.title', 'Components')}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Releases.Detail.Overview.components.description',
            'What this release ships, fixed when it was created.',
          )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <DataTable
          columns={columns}
          data={components}
          variant="simple"
          emptyMessage={t(
            'Pages.Releases.Detail.Overview.components.empty',
            'This release has no components.',
          )}
        />
      </DetailCard.Content>
    </DetailCard>
  );
}
