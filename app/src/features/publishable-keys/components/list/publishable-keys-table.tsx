import { type ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey } from '@/api-client';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
} from '@/functionals/table';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { OriginsCell } from './origins-cell';
import { PublishableKeyRowActions } from './publishable-key-row-actions';
import { PublishableKeyStatusBadge } from './publishable-key-status-badge';

type PublishableKeysTableProps = {
  /** What to say when there is no key, which tells why for the state of the list. */
  emptyMessage?: ReactNode;
  keys: readonly PublishableKey[];
};

const getKeyId = (publishableKey: PublishableKey) => publishableKey.id;

const getRowClassName = (publishableKey: PublishableKey) =>
  publishableKey.revokedAt ? 'text-muted-foreground' : undefined;

/**
 * The keys as rows: what each is for, the last four characters that tell it apart (the
 * key itself is never returned), the origins it may be sent from, when it was made and
 * last used, whether it still authenticates, and what can be done to it. The list is
 * read whole, so the table sorts and pages it in the browser, as it does every other.
 */
export function PublishableKeysTable({
  emptyMessage,
  keys,
}: PublishableKeysTableProps) {
  const { t } = useTranslation();

  const columns = useMemo<ColumnDef<PublishableKey>[]>(
    () => [
      {
        accessorFn: (publishableKey) => publishableKey.label,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.label}</span>
        ),
        header: dataTableSortableHeader(
          t('Pages.Integrations.PublishableKeys.List.Columns.label'),
        ),
        id: 'label',
      },
      {
        accessorFn: (publishableKey) => publishableKey.keyHint,
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {t('Pages.Integrations.PublishableKeys.List.keyHint', {
              hint: row.original.keyHint,
            })}
          </span>
        ),
        enableSorting: false,
        header: t('Pages.Integrations.PublishableKeys.List.Columns.key'),
        id: 'key',
      },
      {
        accessorFn: (publishableKey) => publishableKey.allowedOrigins.length,
        cell: ({ row }) => (
          <OriginsCell origins={row.original.allowedOrigins} />
        ),
        enableSorting: false,
        header: t('Pages.Integrations.PublishableKeys.List.Columns.origins'),
        id: 'origins',
      },
      {
        accessorFn: (publishableKey) => Date.parse(publishableKey.createdAt),
        cell: ({ row }) => (
          <span className="text-sm">{formatDate(row.original.createdAt)}</span>
        ),
        header: dataTableSortableHeader(
          t('Pages.Integrations.PublishableKeys.List.Columns.created'),
        ),
        id: 'created',
        meta: { defaultSort: 'desc' },
      },
      {
        accessorFn: (publishableKey) =>
          publishableKey.lastUsedAt ? Date.parse(publishableKey.lastUsedAt) : 0,
        cell: ({ row }) =>
          row.original.lastUsedAt ? (
            <span className="text-sm">
              {formatDateTime(row.original.lastUsedAt)}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('Pages.Integrations.PublishableKeys.List.neverUsed')}
            </span>
          ),
        header: dataTableSortableHeader(
          t('Pages.Integrations.PublishableKeys.List.Columns.lastUsed'),
        ),
        id: 'lastUsed',
      },
      {
        accessorFn: (publishableKey) => (publishableKey.revokedAt ? 1 : 0),
        cell: ({ row }) => (
          <PublishableKeyStatusBadge publishableKey={row.original} />
        ),
        header: dataTableSortableHeader(
          t('Pages.Integrations.PublishableKeys.List.Columns.status'),
        ),
        id: 'status',
      },
      createActionsColumn<PublishableKey>((publishableKey) => (
        <PublishableKeyRowActions publishableKey={publishableKey} />
      )),
    ],
    [t],
  );

  return (
    <DataTable
      bodyScrollable
      className="h-full"
      columns={columns}
      data={keys as PublishableKey[]}
      emptyMessage={emptyMessage}
      getRowClassName={getRowClassName}
      getRowId={getKeyId}
    />
  );
}
