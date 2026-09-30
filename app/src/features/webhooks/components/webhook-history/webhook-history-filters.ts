import type { TFunction } from 'i18next';
import type {
  FilterFieldDefinition,
  FilterOption,
} from '@/functionals/filters';
import type { WebhookHistoryEntry } from '../../types';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
  getWebhookEventOptionLabel,
} from '../../utils/webhook-events';

const WEBHOOK_HISTORY_STATUS_VALUES = [
  'success',
  'pending',
  'fail',
  'sending',
] as const;

const getHookUrl = (
  entry: WebhookHistoryEntry,
  hookUrlById: Map<string, string>,
) => entry.hookUrl || hookUrlById.get(entry.hookId) || entry.hookId;

export const sortWebhookHistoryEntries = (history: WebhookHistoryEntry[]) => {
  return [...history].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
};

export const buildWebhookHistoryHookUrlById = (
  history: WebhookHistoryEntry[],
  webhooks: Array<{ id: string; url: string }>,
) => {
  const entries = new Map<string, string>();

  webhooks.forEach((webhook) => {
    entries.set(webhook.id, webhook.url);
  });

  history.forEach((entry) => {
    if (!entry.hookId) {
      return;
    }

    const nextValue =
      entry.hookUrl || entries.get(entry.hookId) || entry.hookId;
    entries.set(entry.hookId, nextValue);
  });

  return entries;
};

export const buildWebhookHistoryHookOptions = (
  hookUrlById: Map<string, string>,
): FilterOption[] => {
  return Array.from(hookUrlById.entries())
    .flatMap(([value, label]) =>
      value.length > 0 ? [{ value, label: label || value }] : [],
    )
    .sort((left, right) => left.label.localeCompare(right.label));
};

// One option per event type the history holds, read as "Group – Label" and
// sorted that way; a type this build does not know reads as itself.
export const buildWebhookHistoryEventOptions = (
  history: WebhookHistoryEntry[],
  t: TFunction,
): FilterOption[] => {
  return [
    ...new Set(
      history.flatMap((entry) =>
        entry.eventType.length > 0 ? [entry.eventType] : [],
      ),
    ),
  ]
    .map((eventType) => ({
      value: eventType,
      label: getWebhookEventOptionLabel(eventType, t),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
};

export const buildWebhookHistoryStatusOptions = (t: TFunction) => {
  return WEBHOOK_HISTORY_STATUS_VALUES.map((status) => ({
    value: status,
    label: t(`Pages.Integrations.Webhooks.History.Status.${status}`),
  }));
};

export const getWebhookHistorySearchTokens = (
  entry: WebhookHistoryEntry,
  hookUrlById: Map<string, string>,
  t: TFunction,
) => {
  const event = getWebhookEvent(entry.eventType);

  return [
    getHookUrl(entry, hookUrlById),
    entry.hookId,
    entry.eventType,
    event?.name ?? '',
    event ? getWebhookEventLabel(entry.eventType, t) : '',
    event ? getWebhookEventGroupLabel(event.group, t) : '',
    entry.responseStatusText ?? '',
    entry.responseStatusCode?.toString() ?? '',
  ];
};

export const createWebhookHistoryFilterFields = ({
  eventOptions,
  hookOptions,
  hookUrlById,
  statusOptions,
  t,
}: {
  eventOptions: FilterOption[];
  hookOptions: FilterOption[];
  hookUrlById: Map<string, string>;
  statusOptions: FilterOption[];
  t: TFunction;
}): FilterFieldDefinition<WebhookHistoryEntry>[] => [
  {
    id: 'query',
    label: t('Pages.Integrations.Webhooks.History.Filters.queryPlaceholder'),
    type: 'text',
    accessor: (entry) => getWebhookHistorySearchTokens(entry, hookUrlById, t),
    placeholder: t(
      'Pages.Integrations.Webhooks.History.Filters.queryPlaceholder',
    ),
  },
  {
    id: 'eventType',
    label: t('Pages.Integrations.Webhooks.History.eventFilter'),
    type: 'enum',
    accessor: (entry) => entry.eventType,
    options: eventOptions,
    quickAccess: true,
    // One option per event the history holds, and one per webhook URL: both
    // lists grow with the account, so each chip has a search box.
    searchable: true,
  },
  {
    id: 'hookId',
    label: t('Pages.Integrations.Webhooks.History.hookFilter'),
    type: 'enum',
    accessor: (entry) => entry.hookId,
    options: hookOptions,
    quickAccess: true,
    searchable: true,
  },
  {
    id: 'status',
    label: t('Pages.Integrations.Webhooks.History.Table.status'),
    type: 'enum',
    accessor: (entry) => entry.status,
    options: statusOptions,
    normalFilterable: false,
  },
  {
    id: 'date',
    label: t('Pages.Integrations.Webhooks.History.Table.date'),
    type: 'date',
    accessor: (entry) => entry.date,
    normalFilterable: false,
  },
];
