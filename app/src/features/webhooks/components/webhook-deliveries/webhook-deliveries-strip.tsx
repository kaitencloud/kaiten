import { cn } from '@/lib/utils';
import type { WebhookDelivery } from '../../types';
import { getDeliveryTone } from '../../utils/webhook-deliveries';
import { DELIVERY_STATUS_PRESENTATION } from './webhook-delivery-status';

interface WebhookDeliveriesStripProps {
  /** Oldest first: the newest delivery is the bar on the right. */
  deliveries: WebhookDelivery[];
}

function renderBar(delivery: WebhookDelivery) {
  const tone = getDeliveryTone(delivery);

  return (
    <span
      key={delivery.key}
      className={cn(
        'h-4 w-1.5 shrink-0 rounded-sm',
        DELIVERY_STATUS_PRESENTATION[tone].markClassName,
      )}
      data-status={tone}
    />
  );
}

/**
 * The recent deliveries of a webhook as a row of bars, one per message,
 * coloured by state. Colour only: the cell that holds it says the same in its
 * accessible name, so the strip is hidden from assistive technologies.
 */
export function WebhookDeliveriesStrip({
  deliveries,
}: WebhookDeliveriesStripProps) {
  return (
    <span
      aria-hidden
      className="flex items-center gap-[3px]"
      data-testid="webhook-deliveries-strip"
    >
      {deliveries.map(renderBar)}
    </span>
  );
}
