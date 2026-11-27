import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { type Ref, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DeliveryWatch } from '../../hooks/use-delivery-watch';
import { webhookMessageQueryOptions } from '../../queries';
import type { WebhookDelivery, WebhookDeliveryStatus } from '../../types';
import {
  resolveAttempts,
  resolveDeliveryState,
} from '../../utils/webhook-deliveries';
import {
  getWebhookEvent,
  getWebhookEventLabel,
} from '../../utils/webhook-events';
import { WebhookDeliveryAttempts } from './webhook-delivery-attempts';
import {
  canResendPayload,
  resolvePayloadState,
  WebhookPayloadBlock,
} from './webhook-delivery-payload';
import { WebhookDeliveryResendButton } from './webhook-delivery-resend-button';
import { WebhookDeliveryResponse } from './webhook-delivery-response';
import { WebhookDeliveryStatusBadge } from './webhook-delivery-status-badge';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface WebhookDeliveryDetailProps {
  delivery: WebhookDelivery;
  /** The attempt to show first; the newest one otherwise. */
  initialAttemptId?: string;
  /** Reads the deliveries again after a resend until it settles; the owner of the dialog holds it. */
  watch: DeliveryWatch;
  /** On a narrow screen, goes back to the list of deliveries the detail replaced. */
  onBack?: () => void;
  /** The Back button, which takes the focus when the detail replaces the list. */
  backButtonRef?: Ref<HTMLButtonElement>;
}

function BackToDeliveries({
  onBack,
  buttonRef,
}: {
  onBack: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();

  return (
    <Button
      ref={buttonRef}
      className="-ml-2 self-start md:hidden"
      onClick={onBack}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ArrowLeft aria-hidden />
      {t('Pages.Integrations.Webhooks.Deliveries.Dialog.back')}
    </Button>
  );
}

function DeliveryHead({
  delivery,
  eventType,
  hasPayload,
  nextAttempt,
  onQueued,
  status,
}: {
  delivery: WebhookDelivery;
  eventType: string;
  hasPayload: boolean;
  nextAttempt?: string;
  onQueued: () => void;
  status: WebhookDeliveryStatus;
}) {
  const { t } = useTranslation();
  const eventName = getWebhookEvent(eventType)?.name;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <h3 className="text-base font-semibold">
          {eventType
            ? getWebhookEventLabel(eventType, t)
            : t(`${DETAIL_KEY}.unknownEvent`)}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {eventName ? (
            <Badge className="font-mono" variant="outline">
              {eventName}
            </Badge>
          ) : null}
          <WebhookDeliveryStatusBadge
            nextAttempt={nextAttempt}
            status={status}
          />
        </div>
        {delivery.messageId ? (
          <p className="text-xs text-muted-foreground">
            {t(`${DETAIL_KEY}.messageId`)}{' '}
            <span className="select-all break-all font-mono">
              {delivery.messageId}
            </span>
          </p>
        ) : null}
      </div>
      <WebhookDeliveryResendButton
        hasPayload={hasPayload}
        messageId={delivery.messageId}
        onQueued={onQueued}
        status={status}
        webhookId={delivery.hookId}
      />
    </div>
  );
}

/**
 * One delivery: its body, the response to the selected attempt, and every
 * attempt, with Resend. Shared by the History tab's dialog and the deliveries
 * dialog. Attempts and status come from the message once it is read, and
 * from the delivery it was opened with until then, so the response and the
 * attempts never wait on the body. With no message id (an older saas-api)
 * nothing is read.
 */
export function WebhookDeliveryDetail({
  delivery,
  initialAttemptId,
  watch,
  onBack,
  backButtonRef,
}: WebhookDeliveryDetailProps) {
  const message = useQuery({
    ...webhookMessageQueryOptions(delivery.hookId, delivery.messageId ?? '', {
      retryNotDelivered: delivery.statusSource === 'message',
    }),
    enabled: Boolean(delivery.messageId),
  });
  const [attemptId, setAttemptId] = useState(initialAttemptId);
  const attempts = resolveAttempts(delivery, message.data);
  const { status, nextAttempt } = resolveDeliveryState(delivery, attempts);
  const foundIndex = attempts.findIndex((attempt) => attempt.id === attemptId);
  const selectedIndex = foundIndex === -1 ? attempts.length - 1 : foundIndex;
  const selected = attempts[selectedIndex];
  const payload = resolvePayloadState(delivery.messageId, message);

  function handleRetry() {
    void message.refetch();
  }

  // The newest attempt known when Resend was pressed: the watch ends on a
  // settled attempt that comes after it.
  function handleQueued() {
    if (delivery.messageId) {
      watch.arm({
        webhookId: delivery.hookId,
        messageId: delivery.messageId,
        latestKnownAttempt: attempts.at(-1),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="webhook-delivery-detail">
      {onBack ? (
        <BackToDeliveries buttonRef={backButtonRef} onBack={onBack} />
      ) : null}
      <DeliveryHead
        delivery={delivery}
        eventType={delivery.eventType || message.data?.eventType || ''}
        hasPayload={canResendPayload(payload)}
        nextAttempt={nextAttempt}
        onQueued={handleQueued}
        status={status}
      />
      <WebhookPayloadBlock onRetry={handleRetry} state={payload} />
      {selected ? (
        <WebhookDeliveryResponse
          attempt={selected}
          count={attempts.length}
          index={selectedIndex + 1}
        />
      ) : null}
      <WebhookDeliveryAttempts
        attempts={attempts}
        onSelect={setAttemptId}
        selectedId={selected?.id}
      />
    </div>
  );
}
