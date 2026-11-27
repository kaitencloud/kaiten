import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WebhookDeliveryStatus } from '../../types';
import {
  getDeliveryTone,
  hasResponseCode,
} from '../../utils/webhook-deliveries';
import {
  DELIVERY_STATUS_PRESENTATION,
  getDeliveryStatusLabel,
} from './webhook-delivery-status';

interface WebhookDeliveryStatusBadgeProps {
  status: WebhookDeliveryStatus;
  /** Set on a pending message that waits for a retry: it reads as retrying. */
  nextAttempt?: string;
  /** Shown after the label of a failure. */
  responseStatusCode?: number;
}

/** The status of a delivery or of one attempt, in words and colour. */
export function WebhookDeliveryStatusBadge({
  status,
  nextAttempt,
  responseStatusCode,
}: WebhookDeliveryStatusBadgeProps) {
  const { t } = useTranslation();
  const tone = getDeliveryTone({ status, nextAttempt });
  const presentation = DELIVERY_STATUS_PRESENTATION[tone];
  const Icon = presentation.icon;

  return (
    <Badge
      variant={presentation.badgeVariant}
      className={cn(Icon && 'gap-1', presentation.badgeClassName)}
      data-status={tone}
    >
      {Icon ? <Icon aria-hidden className="size-3" /> : null}
      {getDeliveryStatusLabel(tone, t)}
      {tone === 'fail' && hasResponseCode(responseStatusCode) ? (
        <span className="font-mono">{responseStatusCode}</span>
      ) : null}
    </Badge>
  );
}
