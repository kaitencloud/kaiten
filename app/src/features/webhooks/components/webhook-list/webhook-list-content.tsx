import { Webhook as WebhookIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Webhook } from '../../types';
import { WebhookTable } from './webhook-table';

interface WebhookListContentProps {
  filteredWebhooks: Webhook[];
  onDelete: (webhookId: string) => void;
  webhooks: Webhook[];
}

export function WebhookListContent({
  filteredWebhooks,
  onDelete,
  webhooks,
}: WebhookListContentProps) {
  const { t } = useTranslation();

  if (webhooks.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="pt-6">
          <div className="text-center py-8">
            <WebhookIcon className="size-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-2">
              {t('Pages.Integrations.Webhooks.emptyState')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('Pages.Integrations.Webhooks.emptyStateHint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (filteredWebhooks.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t('Common.noResults')}
      </div>
    );
  }

  return (
    <WebhookTable
      className="h-full"
      webhooks={filteredWebhooks}
      onDelete={onDelete}
    />
  );
}
