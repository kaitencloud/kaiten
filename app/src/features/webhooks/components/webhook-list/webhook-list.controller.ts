import { useSuspenseQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { useWebhookMutations } from '../../hooks/use-webhook-mutations';
import { webhooksQueryOptions } from '../../queries';
import type { Webhook } from '../../types';
import { mapApiWebhooksToWebhooks } from '../../utils/mappers';
import {
  getWebhookEvent,
  getWebhookEventGroupLabel,
  getWebhookEventLabel,
} from '../../utils/webhook-events';

// A webhook is found by its URL, and by any of its events -- their type, their
// name, or the label and group the viewer reads them under.
export function getWebhookSearchTokens(
  webhook: Webhook,
  t: TFunction,
): string[] {
  const eventTokens = webhook.eventTypes.flatMap((type) => {
    const event = getWebhookEvent(type);
    return event
      ? [
          type,
          event.name,
          getWebhookEventLabel(type, t),
          getWebhookEventGroupLabel(event.group, t),
        ]
      : [type];
  });

  return [webhook.url, ...eventTokens];
}

function buildWebhookFilterFields(
  t: TFunction,
): FilterFieldDefinition<Webhook>[] {
  return [
    {
      id: 'query',
      label: t('Pages.Integrations.Webhooks.Filters.queryPlaceholder'),
      type: 'text',
      accessor: (webhook) => getWebhookSearchTokens(webhook, t),
      placeholder: t('Pages.Integrations.Webhooks.Filters.queryPlaceholder'),
    },
  ];
}

function useFilteredWebhooks(webhooks: Webhook[], t: TFunction) {
  const filterFields = useMemo<FilterFieldDefinition<Webhook>[]>(
    () => buildWebhookFilterFields(t),
    [t],
  );

  return useFilterBuilder({
    data: webhooks,
    fields: filterFields,
    pinnedFilterIds: ['query'],
    debounceMs: 200,
    resetOnDataChange: true,
  });
}

/**
 * Which webhook's deliveries the dialog shows, and whether it is open. Closing
 * only hides it: the webhook is kept so that the closing animation still has
 * its content.
 */
function useDeliveriesDialogState(webhooks: Webhook[]) {
  const [deliveriesWebhookId, setDeliveriesWebhookId] = useState<string | null>(
    null,
  );
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  // Read from every webhook, not the filtered ones: a search that hides the
  // row keeps the dialog open, and a webhook deleted meanwhile closes it.
  const deliveriesWebhook =
    webhooks.find((webhook) => webhook.id === deliveriesWebhookId) ?? null;

  // Stable, like `handleDeleteHook`: the table's columns depend on it, and
  // new columns would remount every cell, the focused Deliveries button too.
  const openDeliveries = useCallback((webhookId: string) => {
    setDeliveriesWebhookId(webhookId);
    setDeliveriesOpen(true);
  }, []);

  return {
    deliveriesOpen,
    deliveriesWebhook,
    openDeliveries,
    setDeliveriesOpen,
  };
}

export function useWebhookListController() {
  const { t } = useTranslation();
  const { data: webhooksData } = useSuspenseQuery(webhooksQueryOptions);
  const { deleteWebhook } = useWebhookMutations();
  const webhooks = useMemo(
    () => mapApiWebhooksToWebhooks(webhooksData),
    [webhooksData],
  );
  const filterController = useFilteredWebhooks(webhooks, t);
  const deliveriesDialog = useDeliveriesDialogState(webhooks);

  const { mutate: deleteWebhookMutate } = deleteWebhook;
  const handleDeleteHook = useCallback(
    (webhookId: string) => {
      deleteWebhookMutate({ path: { webhookId } });
    },
    [deleteWebhookMutate],
  );

  return {
    deliveriesDialog,
    filteredWebhooks: filterController.filteredData,
    filterController,
    handleDeleteHook,
    t,
    webhooks,
  };
}
