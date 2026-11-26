import { AlertCircle } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useDeliveryWatch } from '../../hooks/use-delivery-watch';
import { useWebhookDeliveries } from '../../hooks/use-webhook-deliveries';
import type { Webhook } from '../../types';
import { WEBHOOK_DELIVERIES_LIMIT } from '../../utils/constants';
import { sortDeliveriesNewestFirst } from '../../utils/webhook-deliveries-summary';
import { WebhookDeliveriesHeader } from './webhook-deliveries-header';
import {
  WebhookDeliveryChronology,
  WebhookDeliveryChronologySkeleton,
} from './webhook-delivery-chronology';
import { WebhookDeliveryDetail } from './webhook-delivery-detail';

const DIALOG_KEY = 'Pages.Integrations.Webhooks.Deliveries.Dialog';

const PANE_CLASS_NAME = 'min-h-0 overflow-y-auto p-4';

/**
 * The chronology beside the detail. The explicit `minmax(0,1fr)` row is what
 * lets each pane scroll inside the fixed-height dialog.
 */
function Panes({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
      {children}
    </div>
  );
}

/** A pane; below `md` only one shows, so the other is hidden there. */
function Pane({
  children,
  hiddenOnPhone,
  side,
}: {
  children: ReactNode;
  hiddenOnPhone: boolean;
  side: 'list' | 'detail';
}) {
  return (
    <div
      className={cn(
        PANE_CLASS_NAME,
        side === 'list' ? 'md:border-r' : 'md:p-6',
        hiddenOnPhone && 'max-md:hidden',
      )}
    >
      {children}
    </div>
  );
}

/** One pane across the dialog: the empty and the error states. */
function SinglePane({ children }: { children: ReactNode }) {
  return (
    <div className={cn(PANE_CLASS_NAME, 'flex-1 space-y-4 md:p-6')}>
      {children}
    </div>
  );
}

interface WebhookDeliveriesDialogProps {
  /**
   * Separate from `webhook`, which the owner keeps while the dialog closes,
   * so that the closing animation does not show an empty dialog.
   */
  open: boolean;
  webhook: Webhook | null;
  onOpenChange: (open: boolean) => void;
}

function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden />
      <AlertTitle>{t(`${DIALOG_KEY}.loadError`)}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{getApiErrorMessage(error)}</span>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          {t('Common.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The open dialog's content: the header, then the chronology beside the
 * selected delivery. Below `md` one pane shows at a time: the chronology, then
 * the delivery picked in it, with a way back. It mounts only while the dialog
 * is open, so it reads nothing while closed, and closing forgets the
 * selection.
 */
function WebhookDeliveriesBody({ webhook }: { webhook: Webhook }) {
  const { t } = useTranslation();
  const watch = useDeliveryWatch();
  const { data, error, isError, refetch } = useWebhookDeliveries(webhook.id, {
    limit: WEBHOOK_DELIVERIES_LIMIT,
    withAttempts: true,
    refetchInterval: watch.refetchInterval,
  });
  const [selectedKey, setSelectedKey] = useState<string>();
  const [showDetail, setShowDetail] = useState(false);
  const deliveries = useMemo(
    () => (data ? sortDeliveriesNewestFirst(data.deliveries) : undefined),
    [data],
  );
  // The chosen delivery, or the newest when none is chosen or it left the list.
  const selected =
    deliveries?.find((delivery) => delivery.key === selectedKey) ??
    deliveries?.[0];

  function handleSelect(key: string) {
    setSelectedKey(key);
    setShowDetail(true);
  }

  function handleBack() {
    setShowDetail(false);
  }

  function handleRetry() {
    void refetch();
  }

  const header = (
    <WebhookDeliveriesHeader summary={data?.summary} url={webhook.url} />
  );

  if (deliveries && deliveries.length > 0 && selected) {
    return (
      <>
        {header}
        <Panes>
          <Pane hiddenOnPhone={showDetail} side="list">
            <WebhookDeliveryChronology
              createdAt={data?.webhook.createdAt}
              deliveries={deliveries}
              hasMore={data?.hasMore}
              onSelect={handleSelect}
              selectedKey={selected.key}
              updatedAt={data?.webhook.updatedAt}
            />
          </Pane>
          <Pane hiddenOnPhone={!showDetail} side="detail">
            <WebhookDeliveryDetail
              key={selected.key}
              delivery={selected}
              onBack={handleBack}
              watch={watch}
            />
          </Pane>
        </Panes>
      </>
    );
  }

  if (deliveries) {
    return (
      <>
        {header}
        <SinglePane>
          <p className="text-sm text-muted-foreground">
            {t(`${DIALOG_KEY}.empty`)}
          </p>
          <WebhookDeliveryChronology
            createdAt={data?.webhook.createdAt}
            deliveries={deliveries}
            onSelect={handleSelect}
            updatedAt={data?.webhook.updatedAt}
          />
        </SinglePane>
      </>
    );
  }

  return (
    <>
      {header}
      {isError ? (
        <SinglePane>
          <LoadError error={error} onRetry={handleRetry} />
        </SinglePane>
      ) : (
        <Panes>
          <Pane hiddenOnPhone={false} side="list">
            <WebhookDeliveryChronologySkeleton />
          </Pane>
          <Pane hiddenOnPhone side="detail">
            <Skeleton className="h-64 w-full" />
          </Pane>
        </Panes>
      )}
    </>
  );
}

/**
 * A webhook's recent deliveries in a large dialog, opened from its row:
 * the chronology on the left, the selected delivery on the right, with its
 * body, its response, its attempts and Resend. A read-only viewer with one
 * action, so its state is local, not a route.
 */
export function WebhookDeliveriesDialog({
  open,
  webhook,
  onOpenChange,
}: WebhookDeliveriesDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open && webhook !== null}>
      <DialogContent
        className="h-[min(44rem,calc(100dvh-2rem))] sm:max-w-5xl"
        data-testid="webhook-deliveries-dialog"
        variant="form"
      >
        {webhook ? <WebhookDeliveriesBody webhook={webhook} /> : null}
      </DialogContent>
    </Dialog>
  );
}
