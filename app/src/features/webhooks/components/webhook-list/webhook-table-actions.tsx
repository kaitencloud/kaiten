import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  TableActionButton,
  TableActions,
  TableDeleteDialog,
} from '@/functionals/table';
import type { Webhook } from '../../types';
import { webhookDisplayName } from '../../utils/webhook-form-values';

type WebhookTableActionsProps = {
  webhook: Webhook;
  onDelete: (webhookId: string) => void;
};

/**
 * What can be done to a webhook: open its edit page, or delete it after a
 * confirmation. The Edit label names the webhook by its host, never by its
 * whole URL: a Slack or Google Chat URL is a credential. The link is not
 * preloaded on hover, because the edit route may read the webhook from the API.
 */
export function WebhookTableActions({
  webhook,
  onDelete,
}: WebhookTableActionsProps) {
  const { t } = useTranslation();

  function handleConfirm() {
    onDelete(webhook.id);
  }

  return (
    <TableActions>
      <TableActionButton
        asChild
        tooltip={t('Pages.Integrations.Webhooks.Table.edit', {
          host: webhookDisplayName(webhook),
        })}
      >
        <Link
          to="/integrations/webhooks/$webhookId/edit"
          params={{ webhookId: webhook.id }}
          preload={false}
        >
          <Pencil className="size-4" />
        </Link>
      </TableActionButton>
      <TableDeleteDialog name={webhook.url} onConfirm={handleConfirm} />
    </TableActions>
  );
}
