import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeliveryWatch } from '../../hooks/use-delivery-watch';
import type { WebhookDelivery } from '../../types';
import { getWebhookEventLabel } from '../../utils/webhook-events';
import { WebhookDeliveryDetail } from './webhook-delivery-detail';
import { formatDeliveryTime } from './webhook-delivery-format';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface WebhookDeliveryDetailDialogProps {
  /**
   * Separate from `delivery`, which the owner keeps while the dialog closes,
   * so that the closing animation does not show an empty dialog.
   */
  open: boolean;
  delivery: WebhookDelivery | null;
  initialAttemptId?: string;
  onOpenChange: (open: boolean) => void;
}

/** The detail of one delivery, alone in a dialog: the History tab's. */
export function WebhookDeliveryDetailDialog({
  open,
  delivery,
  initialAttemptId,
  onOpenChange,
}: WebhookDeliveryDetailDialogProps) {
  const { t } = useTranslation();
  // The dialog stays mounted while closed: `open` tells the watch when it
  // closes, so that it reads the table behind once more.
  const watch = useDeliveryWatch({ open });

  return (
    <Dialog onOpenChange={onOpenChange} open={open && delivery !== null}>
      <DialogContent
        className="sm:max-w-3xl"
        data-testid="webhook-delivery-detail-dialog"
        variant="form"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History
              aria-hidden
              className="size-5 text-primary-subtle-foreground"
            />
            {t(`${DETAIL_KEY}.title`)}
          </DialogTitle>
          <DialogDescription>
            {delivery
              ? t(`${DETAIL_KEY}.description`, {
                  eventName: delivery.eventType
                    ? getWebhookEventLabel(delivery.eventType, t)
                    : t(`${DETAIL_KEY}.unknownEvent`),
                  deliveredAt: formatDeliveryTime(delivery.timestamp),
                })
              : null}
          </DialogDescription>
        </DialogHeader>
        {delivery ? (
          <DialogBody>
            <WebhookDeliveryDetail
              delivery={delivery}
              initialAttemptId={initialAttemptId}
              key={`${delivery.key}:${initialAttemptId ?? ''}`}
              watch={watch}
            />
          </DialogBody>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
