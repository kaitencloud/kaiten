import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatNumber } from '@/lib/format-date';
import type { WebhookMessageCounts } from '../../types';
import { formatDeliveryRate } from '../../utils/webhook-deliveries';

const DIALOG_KEY = 'Pages.Integrations.Webhooks.Deliveries.Dialog';

interface WebhookDeliveriesHeaderProps {
  url: string;
  /** Over the deliveries the dialog lists; absent while they load. */
  summary?: WebhookMessageCounts;
}

function DeliveryRate({ summary }: { summary: WebhookMessageCounts }) {
  const { t } = useTranslation();
  const rate = formatDeliveryRate(summary);
  if (!rate) {
    return null;
  }

  return (
    <div className="shrink-0 space-y-0.5 sm:max-w-[16rem] sm:text-right">
      <p className="text-sm font-medium" data-testid="webhook-deliveries-rate">
        {t(`${DIALOG_KEY}.rate`, {
          delivered: formatNumber(summary.delivered),
          total: formatNumber(summary.total),
          percent: formatNumber(rate.percent / 100, {
            style: 'percent',
            maximumFractionDigits: 0,
          }),
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(`${DIALOG_KEY}.rateHint`, { count: summary.total })}
      </p>
    </div>
  );
}

/**
 * The deliveries dialog's header: its title, the webhook's URL, and the share
 * of the listed deliveries that were delivered. A delivery still in flight
 * counts in the total, not as delivered.
 */
export function WebhookDeliveriesHeader({
  url,
  summary,
}: WebhookDeliveriesHeaderProps) {
  const { t } = useTranslation();

  return (
    <DialogHeader className="sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 space-y-1.5">
        <DialogTitle className="flex items-center gap-2">
          <History
            aria-hidden
            className="size-5 text-primary-subtle-foreground"
          />
          {t('Pages.Integrations.Webhooks.Deliveries.title')}
        </DialogTitle>
        <DialogDescription className="break-all font-mono text-xs">
          {url}
        </DialogDescription>
      </div>
      {summary ? <DeliveryRate summary={summary} /> : null}
    </DialogHeader>
  );
}
