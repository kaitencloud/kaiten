import { useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TableActionButton } from '@/functionals/table';
import { cn } from '@/lib/utils';
import { webhookDetailQueryOptions } from '../../queries';
import type { Webhook } from '../../types';

const SIGNING_SECRET_MASK = '**********************';

interface WebhookSigningSecretCellProps {
  webhook: Webhook;
}

export function WebhookSigningSecretCell({
  webhook,
}: WebhookSigningSecretCellProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [signingSecret, setSigningSecret] = useState(
    webhook.signingSecret ?? '',
  );

  async function handleToggleVisibility() {
    if (isVisible) {
      setIsVisible(false);
      return;
    }

    if (!signingSecret) {
      setIsLoading(true);

      try {
        const webhookDetails = await queryClient.fetchQuery(
          webhookDetailQueryOptions(webhook.id),
        );

        if (!webhookDetails.signingSecret) {
          throw new Error('Missing signing secret');
        }

        setSigningSecret(webhookDetails.signingSecret);
      } catch {
        toast.error(
          t('Pages.Integrations.Webhooks.Table.signingSecretLoadError'),
        );
        return;
      } finally {
        setIsLoading(false);
      }
    }

    setIsVisible(true);
  }

  async function handleCopySecret() {
    if (!signingSecret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(signingSecret);
      toast.success(t('Pages.Integrations.Webhooks.Table.signingSecretCopied'));
    } catch {
      toast.error(
        t('Pages.Integrations.Webhooks.Table.signingSecretCopyError'),
      );
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span
        title={isVisible ? signingSecret : undefined}
        className={cn(
          'block min-w-0 flex-1 truncate font-mono text-xs leading-6',
          isVisible && signingSecret
            ? 'text-foreground'
            : 'text-muted-foreground',
        )}
      >
        {isVisible ? signingSecret : SIGNING_SECRET_MASK}
      </span>
      <div className="flex shrink-0 items-center">
        {isVisible && signingSecret ? (
          <TableActionButton
            tooltip={t('Pages.Integrations.Webhooks.Table.copySigningSecret')}
            type="button"
            onClick={handleCopySecret}
          >
            <Copy className="size-4" />
          </TableActionButton>
        ) : null}
        <TableActionButton
          tooltip={t(
            isVisible
              ? 'Pages.Integrations.Webhooks.Table.hideSigningSecret'
              : 'Pages.Integrations.Webhooks.Table.showSigningSecret',
          )}
          type="button"
          disabled={isLoading}
          onClick={handleToggleVisibility}
        >
          {isLoading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : isVisible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </TableActionButton>
      </div>
    </div>
  );
}
