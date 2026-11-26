import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { WebhookMessageAttempt } from '../../types';
import { hasResponseCode } from '../../utils/webhook-deliveries';
import {
  formatDeliveryDuration,
  formatDeliveryTime,
} from './webhook-delivery-format';
import { WebhookDeliveryStatusBadge } from './webhook-delivery-status-badge';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

interface WebhookDeliveryResponseProps {
  attempt: WebhookMessageAttempt;
  /** 1-based, among the attempts oldest first. */
  index: number;
  count: number;
}

function ResponseBody({ attempt }: { attempt: WebhookMessageAttempt }) {
  const { t } = useTranslation();

  if (attempt.response) {
    return (
      <pre
        aria-label={t(`${DETAIL_KEY}.responseBodyLabel`)}
        className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-xs"
        role="region"
        tabIndex={0}
      >
        {attempt.response}
      </pre>
    );
  }

  const unanswered =
    attempt.status === 'fail' && !hasResponseCode(attempt.responseStatusCode);

  return (
    <p className="text-sm text-muted-foreground">
      {t(
        unanswered
          ? `${DETAIL_KEY}.noResponseReceived`
          : `${DETAIL_KEY}.noResponseBody`,
      )}
    </p>
  );
}

/** What the endpoint answered to one attempt: code, time taken, body. */
export function WebhookDeliveryResponse({
  attempt,
  index,
  count,
}: WebhookDeliveryResponseProps) {
  const { t } = useTranslation();
  const code = attempt.responseStatusCode;
  const duration = attempt.responseDurationMs ?? 0;

  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">
        {t(`${DETAIL_KEY}.response`, { index, count })}
      </h4>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <WebhookDeliveryStatusBadge status={attempt.status} />
        {hasResponseCode(code) ? (
          <span className="font-mono">{code}</span>
        ) : attempt.status === 'fail' ? (
          <span className="text-muted-foreground">
            {t('Pages.Integrations.Webhooks.Deliveries.Outcome.noResponse')}
          </span>
        ) : null}
        {duration > 0 ? (
          <span className="text-muted-foreground">
            {formatDeliveryDuration(duration, t)}
          </span>
        ) : null}
        <time className="text-muted-foreground" dateTime={attempt.timestamp}>
          {formatDeliveryTime(attempt.timestamp)}
        </time>
        {attempt.triggerType === 'manual' ? (
          <Badge variant="outline">{t(`${DETAIL_KEY}.resentManually`)}</Badge>
        ) : null}
      </div>
      <ResponseBody attempt={attempt} />
    </section>
  );
}
