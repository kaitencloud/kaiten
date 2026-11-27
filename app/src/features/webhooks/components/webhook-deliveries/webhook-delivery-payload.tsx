import type { UseQueryResult } from '@tanstack/react-query';
import { AlertCircle, Archive, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyValueButton } from '@/components/copy-value-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getApiErrorMessage, isNotFoundError } from '@/lib/errors';
import type { WebhookMessage, WebhookMessageChatService } from '../../types';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

/** What the body section can show, in the order it is decided. */
export type DeliveryPayloadState =
  | { kind: 'notReported' }
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'notFound' }
  | { kind: 'error'; error: unknown }
  | {
      kind: 'ready';
      payload: Record<string, unknown>;
      chatService?: WebhookMessageChatService;
    };

/**
 * The body section's state. The order matters: a query that is not enabled
 * (no message id, an older saas-api) stays pending forever, and data wins over
 * an error, so a failed background refetch never hides a loaded body.
 */
export function resolvePayloadState(
  messageId: string | undefined,
  message: Pick<UseQueryResult<WebhookMessage>, 'data' | 'error' | 'isError'>,
): DeliveryPayloadState {
  if (!messageId) {
    return { kind: 'notReported' };
  }
  if (message.data !== undefined) {
    const { payload, payloadAvailable, chatService } = message.data;
    return payload === null || payloadAvailable === false
      ? { kind: 'gone' }
      : { kind: 'ready', payload, chatService };
  }
  if (message.isError) {
    return isNotFoundError(message.error)
      ? { kind: 'notFound' }
      : { kind: 'error', error: message.error };
  }

  return { kind: 'loading' };
}

/** Whether the body can still be resent: not when it is known to be gone. */
export function canResendPayload(state: DeliveryPayloadState): boolean {
  return state.kind !== 'gone' && state.kind !== 'notFound';
}

function PayloadNotice({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Archive;
  title?: string;
  hint: string;
}) {
  return (
    <div className="flex gap-3 rounded-md border border-dashed p-4 text-sm">
      <Icon
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <p className="text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function ReadyPayload({
  payload,
  chatService,
}: {
  payload: Record<string, unknown>;
  chatService?: WebhookMessageChatService;
}) {
  const { t } = useTranslation();
  const pretty = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">
            {t(
              chatService
                ? `${DETAIL_KEY}.chatEvent`
                : `${DETAIL_KEY}.bodySent`,
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            {chatService
              ? t(`${DETAIL_KEY}.chatEventHint`, { service: chatService })
              : t(`${DETAIL_KEY}.bodyFidelity`)}
          </p>
        </div>
        <CopyValueButton
          copiedMessage={t(`${DETAIL_KEY}.bodyCopied`)}
          copyFailedMessage={t(`${DETAIL_KEY}.bodyCopyError`)}
          label={t(`${DETAIL_KEY}.copyBody`)}
          value={pretty}
        />
      </div>
      <pre
        aria-label={t(
          chatService
            ? `${DETAIL_KEY}.chatEventLabel`
            : `${DETAIL_KEY}.bodyLabel`,
        )}
        className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
        role="region"
        tabIndex={0}
      >
        {pretty}
      </pre>
    </div>
  );
}

/**
 * The body of a delivery: the message's payload as JSON, or why it cannot be
 * shown. The payload can hold customer data: it is never logged, and the
 * query keeps it in memory for a minute only.
 */
export function WebhookPayloadBlock({
  state,
  onRetry,
}: {
  state: DeliveryPayloadState;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  switch (state.kind) {
    case 'notReported':
      return (
        <PayloadNotice
          icon={Archive}
          hint={t(`${DETAIL_KEY}.bodyNotReported`)}
        />
      );
    case 'loading':
      return <Skeleton className="h-40 w-full" />;
    case 'gone':
      return (
        <PayloadNotice
          hint={t(`${DETAIL_KEY}.bodyGoneHint`)}
          icon={Archive}
          title={t(`${DETAIL_KEY}.bodyGone`)}
        />
      );
    case 'notFound':
      return (
        <PayloadNotice
          icon={SearchX}
          hint={t(`${DETAIL_KEY}.deliveryNotFound`)}
        />
      );
    case 'error':
      return (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>{t(`${DETAIL_KEY}.bodyLoadError`)}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{getApiErrorMessage(state.error)}</span>
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              {t('Common.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      );
    case 'ready':
      return (
        <ReadyPayload chatService={state.chatService} payload={state.payload} />
      );
  }
}
