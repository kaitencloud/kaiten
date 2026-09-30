import { formatDateTime } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import type { WebhookHistoryEntry } from '../../types';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
} from '../../utils/webhook-events';

const formatDate = (date: string) => formatDateTime(date);

const getHookUrl = (
  entry: WebhookHistoryEntry,
  hookUrlById: Map<string, string>,
) => entry.hookUrl || hookUrlById.get(entry.hookId) || entry.hookId;

function HookUrlCell({
  entry,
  hookUrlById,
}: {
  entry: WebhookHistoryEntry;
  hookUrlById: Map<string, string>;
}) {
  return (
    <span className="font-mono text-sm truncate max-w-[320px] block">
      {getHookUrl(entry, hookUrlById)}
    </span>
  );
}

function EventCell({ entry, t }: { entry: WebhookHistoryEntry; t: TFunction }) {
  const event = getWebhookEvent(entry.eventType);

  if (!event) {
    return <span className="text-sm font-mono">{entry.eventType}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="text-xs">
        {getWebhookEventGroupLabel(event.group, t)}
      </Badge>
      <span className="text-sm font-medium">
        {getWebhookEventLabel(entry.eventType, t)}
      </span>
    </div>
  );
}

function StatusCell({
  entry,
  t,
}: {
  entry: WebhookHistoryEntry;
  t: TFunction;
}) {
  if (entry.status === 'success') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="size-3" />
        {t('Pages.Integrations.Webhooks.History.Status.success')}
      </Badge>
    );
  }

  if (entry.status === 'fail') {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        {t('Pages.Integrations.Webhooks.History.Status.fail')}
        {entry.responseStatusCode != null && (
          <span className="font-mono">{entry.responseStatusCode}</span>
        )}
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      {entry.status === 'pending'
        ? t('Pages.Integrations.Webhooks.History.Status.pending')
        : t('Pages.Integrations.Webhooks.History.Status.sending')}
    </Badge>
  );
}

function FailureInfoCell({ entry }: { entry: WebhookHistoryEntry }) {
  if (entry.status !== 'fail') {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <span className="text-sm text-destructive-subtle-foreground truncate max-w-[280px] block">
      {entry.responseStatusText || '—'}
    </span>
  );
}

function FailureActionCell({
  entry,
  onSelectFailure,
  t,
}: {
  entry: WebhookHistoryEntry;
  onSelectFailure: (entry: WebhookHistoryEntry) => void;
  t: TFunction;
}) {
  if (entry.status !== 'fail' || !entry.responseStatusText) {
    return null;
  }

  function handleClick() {
    onSelectFailure(entry);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto gap-1 px-2 py-1 text-primary-subtle-foreground"
      onClick={handleClick}
    >
      <AlertCircle className="size-3" />
      {t('Pages.Integrations.Webhooks.History.Table.viewDetails')}
    </Button>
  );
}

export const createWebhookHistoryColumns = ({
  hookUrlById,
  onSelectFailure,
  t,
}: {
  hookUrlById: Map<string, string>;
  onSelectFailure: (entry: WebhookHistoryEntry) => void;
  t: TFunction;
}): ColumnDef<WebhookHistoryEntry>[] => [
  {
    accessorKey: 'date',
    header: dataTableSortableHeader(
      t('Pages.Integrations.Webhooks.History.Table.date'),
    ),
    meta: { defaultSort: 'desc' },
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(row.original.date)}
      </span>
    ),
  },
  {
    id: 'hookUrl',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.hookUrl'),
    cell: ({ row }) => (
      <HookUrlCell entry={row.original} hookUrlById={hookUrlById} />
    ),
  },
  {
    accessorKey: 'eventType',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.event'),
    cell: ({ row }) => <EventCell entry={row.original} t={t} />,
  },
  {
    accessorKey: 'status',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.status'),
    cell: ({ row }) => <StatusCell entry={row.original} t={t} />,
  },
  {
    id: 'failureInfo',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.failureInfo'),
    cell: ({ row }) => <FailureInfoCell entry={row.original} />,
  },
  {
    id: 'actions',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.actions'),
    meta: { headerClassName: 'w-[120px]' },
    cell: ({ row }) => (
      <FailureActionCell
        entry={row.original}
        onSelectFailure={onSelectFailure}
        t={t}
      />
    ),
  },
];
