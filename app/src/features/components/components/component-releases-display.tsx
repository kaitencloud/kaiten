import { Badge } from '@/components/ui/badge';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatReleaseStatus,
  getReleaseStatusBadgeVariant,
} from '@/domains/release-management';
import { type ColumnDef, TableLinkedItemsDialog } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDate } from '@/lib/detail';
import type { ComponentCatalogRelease } from '../types';

const VersionIcon = dataModelIcons.version;

type ComponentReleasesDisplayProps = {
  componentName: string;
  releases: ComponentCatalogRelease[];
};

export function ComponentReleasesDisplay({
  componentName,
  releases,
}: ComponentReleasesDisplayProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en-US';

  const columns = useMemo<ColumnDef<ComponentCatalogRelease>[]>(
    () => [
      {
        accessorKey: 'version',
        header: t(
          'Pages.Releases.Components.Dialog.Columns.release',
          'Release',
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <VersionIcon className="size-4 text-primary-subtle-foreground" />
            {row.original.slug ? (
              <Link
                to="/releases/$releaseSlug"
                params={{ releaseSlug: row.original.slug }}
                className="font-medium text-primary-subtle-foreground hover:underline"
              >
                {row.original.version}
              </Link>
            ) : (
              <span className="font-medium">{row.original.version}</span>
            )}
          </div>
        ),
      },
      {
        id: 'status',
        header: t('Pages.Releases.Components.Dialog.Columns.status', 'Status'),
        cell: ({ row }) => (
          <Badge variant={getReleaseStatusBadgeVariant(row.original.status)}>
            {formatReleaseStatus(row.original.status, t)}
          </Badge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t(
          'Pages.Releases.Components.Dialog.Columns.created',
          'Created',
        ),
        cell: ({ row }) => formatDate(row.original.createdAt, locale),
      },
    ],
    [locale, t],
  );

  if (releases.length === 0) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  return (
    <TableLinkedItemsDialog
      columns={columns}
      data={releases}
      description={t(
        'Pages.Releases.Components.Dialog.description',
        'List of all releases that include this component',
      )}
      title={t('Pages.Releases.Components.Dialog.title', {
        defaultValue: 'Releases for {{name}}',
        name: componentName,
      })}
      triggerLabel={t('Pages.Releases.Components.Table.releaseCount', {
        count: releases.length,
        defaultValue: '{{count}} releases',
      })}
    />
  );
}
