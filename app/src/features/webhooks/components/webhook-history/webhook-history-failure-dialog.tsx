import { formatDateTime } from '@/lib/format-date';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WebhookHistoryEntry } from '../../types';
import { getWebhookEventLabel } from '../../utils/webhook-events';

const formatDate = (date: string) => formatDateTime(date);

interface WebhookHistoryFailureDialogProps {
  entry: WebhookHistoryEntry | null;
  onOpenChange: (open: boolean) => void;
}

export function WebhookHistoryFailureDialog({
  entry,
  onOpenChange,
}: WebhookHistoryFailureDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive-subtle-foreground" />
            {t('Pages.Integrations.Webhooks.History.FailureDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {entry &&
              t(
                'Pages.Integrations.Webhooks.History.FailureDialog.description',
                {
                  eventName: getWebhookEventLabel(entry.eventType, t),
                  deliveredAt: formatDate(entry.date),
                },
              )}
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <DialogBody className="space-y-3 text-sm">
            <div>
              <span className="font-medium">
                {t(
                  'Pages.Integrations.Webhooks.History.FailureDialog.hookLabel',
                )}
              </span>{' '}
              <span className="font-mono break-all">{entry.hookUrl}</span>
            </div>
            {entry.responseStatusCode != null && (
              <div>
                <span className="font-medium">
                  {t(
                    'Pages.Integrations.Webhooks.History.FailureDialog.statusCodeLabel',
                  )}
                </span>{' '}
                <span className="font-mono">{entry.responseStatusCode}</span>
              </div>
            )}
            <div>
              <span className="font-medium">
                {t(
                  'Pages.Integrations.Webhooks.History.FailureDialog.responseLabel',
                )}
              </span>
              <p className="mt-1 rounded-md border bg-muted/30 p-3 text-muted-foreground whitespace-pre-wrap break-words">
                {entry.responseStatusText || '—'}
              </p>
            </div>
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  );
}
