import { useSuspenseQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type FilterFieldDefinition,
  useFilterBuilder,
} from '@/functionals/filters';
import { useWebhookMutations } from '../../hooks/use-webhook-mutations';
import { webhooksQueryOptions } from '../../queries';
import type { CreateWebhookFormValues } from '../../schemas';
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

function useWebhookDialogState() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  function openAddDialog() {
    setAddDialogOpen(true);
  }

  return {
    addDialogOpen,
    openAddDialog,
    setAddDialogOpen,
  };
}

export function useWebhookListController() {
  const { t } = useTranslation();
  const { data: webhooksData } = useSuspenseQuery(webhooksQueryOptions);
  const { createWebhook, deleteWebhook } = useWebhookMutations();
  const webhooks = useMemo(
    () => mapApiWebhooksToWebhooks(webhooksData),
    [webhooksData],
  );
  const filterController = useFilteredWebhooks(webhooks, t);
  const dialogState = useWebhookDialogState();

  async function handleCreateWebhook(value: CreateWebhookFormValues) {
    await createWebhook.mutateAsync({
      body: value,
    });
  }

  function handleDeleteHook(webhookId: string) {
    deleteWebhook.mutate({ path: { webhookId } });
  }

  return {
    ...dialogState,
    filteredWebhooks: filterController.filteredData,
    filterController,
    handleCreateWebhook,
    handleDeleteHook,
    t,
    webhooks,
  };
}
