import { formatDateTime, formatNumber } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { Eye } from 'lucide-react';
import { type ColumnDef, dataTableSortableHeader } from '@/functionals/table';
import { cn } from '@/lib/utils';
import type { WebhookHistoryEntry } from '../../types';
import {
  hasResponseCode,
  normalizeDeliveryStatus,
  OUTCOME_SEPARATOR,
} from '../../utils/webhook-deliveries';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
} from '../../utils/webhook-events';
import { WebhookDeliveryStatusBadge } from '../webhook-deliveries';

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

function ResponseCell({
  entry,
  t,
}: {
  entry: WebhookHistoryEntry;
  t: TFunction;
}) {
  const failed = entry.status === 'fail';

  if (!hasResponseCode(entry.responseStatusCode)) {
    return failed ? (
      <span className="text-sm text-destructive-subtle-foreground">
        {t('Pages.Integrations.Webhooks.Deliveries.Outcome.noResponse')}
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    );
  }

  const duration = entry.responseDurationMs ?? 0;

  return (
    <span
      className={cn(
        'block max-w-[280px] truncate text-sm',
        failed ? 'text-destructive-subtle-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="font-mono">{entry.responseStatusCode}</span>
      {duration > 0
        ? `${OUTCOME_SEPARATOR}${t(
            'Pages.Integrations.Webhooks.Deliveries.Outcome.duration',
            { value: formatNumber(duration) },
          )}`
        : null}
      {entry.responseStatusText
        ? `${OUTCOME_SEPARATOR}${entry.responseStatusText}`
        : null}
    </span>
  );
}

function DeliveryActionCell({
  entry,
  onSelectEntry,
  t,
}: {
  entry: WebhookHistoryEntry;
  onSelectEntry: (entry: WebhookHistoryEntry) => void;
  t: TFunction;
}) {
  function handleClick() {
    onSelectEntry(entry);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto gap-1 px-2 py-1 text-primary-subtle-foreground"
      onClick={handleClick}
    >
      <Eye aria-hidden className="size-3" />
      {t('Pages.Integrations.Webhooks.History.Table.viewDetails')}
    </Button>
  );
}

export const createWebhookHistoryColumns = ({
  hookUrlById,
  onSelectEntry,
  t,
}: {
  hookUrlById: Map<string, string>;
  onSelectEntry: (entry: WebhookHistoryEntry) => void;
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
    cell: ({ row }) => (
      <WebhookDeliveryStatusBadge
        responseStatusCode={row.original.responseStatusCode}
        status={normalizeDeliveryStatus(row.original.status)}
      />
    ),
  },
  {
    id: 'response',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.response'),
    cell: ({ row }) => <ResponseCell entry={row.original} t={t} />,
  },
  {
    id: 'actions',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.History.Table.actions'),
    meta: { headerClassName: 'w-[120px]' },
    cell: ({ row }) => (
      <DeliveryActionCell
        entry={row.original}
        onSelectEntry={onSelectEntry}
        t={t}
      />
    ),
  },
];
