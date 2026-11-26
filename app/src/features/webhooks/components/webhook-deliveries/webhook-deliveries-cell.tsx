import type { TFunction } from 'i18next';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getAppLocale } from '@/lib/app-locale';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import {
  type WebhookDeliveries,
  useWebhookDeliveries,
} from '../../hooks/use-webhook-deliveries';
import type { Webhook } from '../../types';
import { WEBHOOK_STRIP_SIZE } from '../../utils/constants';
import {
  countRecentDeliveries,
  getLastDeliveryAt,
  getRecentDeliveriesOutcome,
  sortDeliveriesNewestFirst,
} from '../../utils/webhook-deliveries-summary';
import { webhookDisplayName } from '../../utils/webhook-form-values';
import { WebhookDeliveriesStrip } from './webhook-deliveries-strip';

const CELL_KEY = 'Pages.Integrations.Webhooks.Deliveries.cell';

interface WebhookDeliveriesCellProps {
  webhook: Webhook;
  onOpen: (webhookId: string) => void;
}

/** "3 minutes ago · 2 failures": the newest delivery, then the worst state. */
function describeRecentDeliveries(data: WebhookDeliveries, t: TFunction) {
  const counts = countRecentDeliveries(data.deliveries, data.summary);
  const outcome = getRecentDeliveriesOutcome(counts);
  const lastDeliveryAt = getLastDeliveryAt(data.deliveries);
  const summary = t(`${CELL_KEY}.summary`, {
    when: lastDeliveryAt
      ? formatRelativeTimeToNow(lastDeliveryAt, getAppLocale())
      : '—',
    outcome:
      outcome.kind === 'allDelivered'
        ? t(`${CELL_KEY}.allDelivered`)
        : t(`${CELL_KEY}.${outcome.kind}`, { count: outcome.count }),
  });
  const tooltip = t(`${CELL_KEY}.tooltip`, { ...counts, count: counts.total });

  return { summary, tooltip };
}

function DeliveriesCellButton({
  data,
  onOpen,
  webhook,
}: {
  data: WebhookDeliveries;
  onOpen: (webhookId: string) => void;
  webhook: Webhook;
}) {
  const { t } = useTranslation();
  const { summary, tooltip } = describeRecentDeliveries(data, t);
  const oldestFirst = sortDeliveriesNewestFirst(data.deliveries)
    .slice(0, WEBHOOK_STRIP_SIZE)
    .reverse();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    onOpen(webhook.id);
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={t(`${CELL_KEY}.ariaLabel`, {
              host: webhookDisplayName(webhook),
              summary,
            })}
            className="-m-1 flex w-full min-w-0 flex-col items-start gap-1 rounded-md p-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            data-row-actions
            onClick={handleClick}
            type="button"
          >
            <WebhookDeliveriesStrip deliveries={oldestFirst} />
            <span className="block w-full truncate text-xs text-muted-foreground">
              {summary}
            </span>
          </button>
        }
      />
      <TooltipContent align="start" side="top">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The Deliveries cell of a webhook's row: its recent deliveries as a strip of
 * bars and one line of text, which opens the deliveries dialog. Each row reads
 * its own list without suspending, so a slow or failing webhook never holds
 * the table; the last good strip stays drawn when a background read fails.
 */
export function WebhookDeliveriesCell({
  webhook,
  onOpen,
}: WebhookDeliveriesCellProps) {
  const { t } = useTranslation();
  const { data, isError, refetch } = useWebhookDeliveries(webhook.id, {
    limit: WEBHOOK_STRIP_SIZE,
    withAttempts: false,
  });

  function handleRetry() {
    void refetch();
  }

  if (data && data.deliveries.length > 0) {
    return (
      <DeliveriesCellButton data={data} onOpen={onOpen} webhook={webhook} />
    );
  }
  if (data) {
    return (
      <span className="text-xs text-muted-foreground">
        {t(`${CELL_KEY}.none`)}
      </span>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t(`${CELL_KEY}.loadError`)}
        </span>
        <Button
          data-row-actions
          onClick={handleRetry}
          size="xs"
          type="button"
          variant="ghost"
        >
          {t('Common.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div aria-busy="true" className="flex flex-col gap-1.5 py-0.5">
      <Skeleton className="h-4 w-40 max-w-full" />
      <Skeleton className="h-3 w-28 max-w-full" />
    </div>
  );
}
