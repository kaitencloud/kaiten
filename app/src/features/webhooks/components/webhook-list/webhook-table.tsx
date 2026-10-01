import { formatDate } from '@/lib/format-date';
import type { TFunction } from 'i18next';
import type { RefObject } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
  dataTableSortableHeader,
  TableActions,
  TableDeleteDialog,
} from '@/functionals/table';
import { useEllipsis } from '@/hooks/use-ellipsis';
import { cn } from '@/lib/utils';
import type { Webhook } from '../../types';
import { WEBHOOK_EVENT_GROUPS } from '../../utils/webhook-event-catalogue';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
} from '../../utils/webhook-events';
import { WebhookSigningSecretCell } from './webhook-signing-secret-cell';

interface WebhookTableProps {
  className?: string;
  webhooks: Webhook[];
  onDelete: (webhookId: string) => void;
}

type WebhookEventGroupView = {
  key: string;
  title: string;
  names: string[];
};

// A webhook's events as its tooltip lists them: by group, under the title the
// subscription dialog uses, by the name each event carries in its payload.
// Events the dialog does not offer, and types this build does not know, close
// the list under "Other events", the latter as their raw type.
function buildWebhookEventGroups(
  eventTypes: string[],
  t: TFunction,
): WebhookEventGroupView[] {
  const groups = WEBHOOK_EVENT_GROUPS.flatMap((group) => {
    const names = eventTypes.flatMap((type) => {
      const event = getWebhookEvent(type);
      return event?.group === group ? [event.name] : [];
    });
    return names.length > 0
      ? [{ key: group, title: getWebhookEventGroupLabel(group, t), names }]
      : [];
  });

  const others = eventTypes.flatMap((type) => {
    const event = getWebhookEvent(type);
    if (event?.group) {
      return [];
    }
    return [event?.name ?? type];
  });
  if (others.length === 0) {
    return groups;
  }

  return [
    ...groups,
    { key: 'other', title: getWebhookEventGroupLabel(null, t), names: others },
  ];
}

function getWebhookEventsSummary(eventTypes: string[]) {
  return eventTypes
    .map((type) => getWebhookEvent(type)?.name ?? type)
    .join(', ');
}

function renderEventName(name: string) {
  return (
    <span
      key={name}
      className="rounded border border-background/15 bg-background/10 px-2 py-1 font-mono text-[11px] leading-4 text-background"
    >
      {name}
    </span>
  );
}

function WebhookEventTooltipSection({
  group,
}: {
  group: WebhookEventGroupView;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-background/70">
        {group.title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {group.names.map(renderEventName)}
      </div>
    </div>
  );
}

function renderEventGroup(group: WebhookEventGroupView) {
  return <WebhookEventTooltipSection key={group.key} group={group} />;
}

function WebhookEventsTooltipContent({ eventTypes }: { eventTypes: string[] }) {
  const { t } = useTranslation();
  const eventGroups = buildWebhookEventGroups(eventTypes, t);
  return <div className="space-y-3">{eventGroups.map(renderEventGroup)}</div>;
}

function WebhookEventsSummaryText({
  className,
  eventTypes,
  summaryRef,
}: {
  className?: string;
  eventTypes: string[];
  summaryRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <span
      ref={summaryRef as RefObject<HTMLSpanElement>}
      className={cn(
        'block w-full min-w-0 font-mono text-xs leading-6 text-foreground',
        className,
      )}
    >
      {getWebhookEventsSummary(eventTypes)}
    </span>
  );
}

function WebhookEventsCell({ webhook }: { webhook: Webhook }) {
  const ellipsis = useEllipsis();

  if (!ellipsis.isEllipsis) {
    return (
      <div className="min-w-0">
        <WebhookEventsSummaryText
          className={ellipsis.className}
          eventTypes={webhook.eventTypes}
          summaryRef={ellipsis.ref}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="block w-full min-w-0 cursor-help text-left"
            >
              <WebhookEventsSummaryText
                className={ellipsis.className}
                eventTypes={webhook.eventTypes}
                summaryRef={ellipsis.ref}
              />
            </button>
          }
        />
        <TooltipContent align="start" side="top" className="max-w-md px-3 py-2">
          <WebhookEventsTooltipContent eventTypes={webhook.eventTypes} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function WebhookUrlCell({ webhook }: { webhook: Webhook }) {
  return (
    <div className="w-full min-w-0 truncate font-mono text-sm">
      {webhook.url}
    </div>
  );
}

function WebhookCreatedAtCell({ webhook }: { webhook: Webhook }) {
  return (
    <span className="text-sm text-muted-foreground">
      {webhook.createdAt ? formatDate(webhook.createdAt) : '—'}
    </span>
  );
}

function createWebhookActionsCell(onDelete: (webhookId: string) => void) {
  return (webhook: Webhook) => {
    function handleConfirm() {
      onDelete(webhook.id);
    }

    return (
      <TableActions>
        <TableDeleteDialog name={webhook.url} onConfirm={handleConfirm} />
      </TableActions>
    );
  };
}

const createColumns = (
  t: TFunction,
  onDelete: (webhookId: string) => void,
): ColumnDef<Webhook>[] => [
  {
    accessorKey: 'eventTypes',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.Table.events'),
    cell: ({ row }) => <WebhookEventsCell webhook={row.original} />,
    meta: {
      headerClassName: 'w-[34%]',
      cellClassName: 'align-top',
    },
  },
  {
    accessorKey: 'url',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.Table.url'),
    cell: ({ row }) => <WebhookUrlCell webhook={row.original} />,
    meta: {
      headerClassName: 'w-[30%]',
      cellClassName: 'align-top',
    },
  },
  {
    id: 'signingSecret',
    enableSorting: false,
    header: t('Pages.Integrations.Webhooks.Table.signingSecret'),
    cell: ({ row }) => <WebhookSigningSecretCell webhook={row.original} />,
    meta: {
      headerClassName: 'w-[24%]',
      cellClassName: 'align-top',
    },
  },
  {
    accessorKey: 'createdAt',
    header: dataTableSortableHeader(
      t('Pages.Integrations.Webhooks.Table.created'),
    ),
    cell: ({ row }) => <WebhookCreatedAtCell webhook={row.original} />,
    meta: {
      cellClassName: 'align-top whitespace-nowrap',
      defaultSort: 'desc',
      headerClassName: 'w-[9rem] whitespace-nowrap',
    },
  },
  createActionsColumn<Webhook>(createWebhookActionsCell(onDelete)),
];

export function WebhookTable({
  className,
  webhooks,
  onDelete,
}: WebhookTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(() => createColumns(t, onDelete), [onDelete, t]);

  return (
    <DataTable
      className={className}
      columns={columns}
      data={webhooks}
      bodyScrollable
      tableClassName="table-fixed"
    />
  );
}
