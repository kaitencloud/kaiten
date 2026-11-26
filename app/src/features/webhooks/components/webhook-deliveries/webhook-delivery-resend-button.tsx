import { Loader2, RotateCw } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useGrantedScopes } from '@/hooks/use-granted-scopes';
import { hasScope } from '@/lib/granted-scopes';
import { useResendWebhookMessage } from '../../hooks/use-resend-webhook-message';
import type { WebhookDeliveryStatus } from '../../types';
import { WRITE_WEBHOOKS_SCOPE } from '../../utils/constants';

const DETAIL_KEY = 'Pages.Integrations.Webhooks.Deliveries.Detail';

type ResendBlock =
  | 'resendNoMessage'
  | 'resendNoScope'
  | 'resendSending'
  | 'resendNoBody';

/** Why a delivery cannot be resent now, or null when it can. */
export function getResendBlock({
  canWrite,
  hasPayload,
  messageId,
  status,
}: {
  canWrite: boolean;
  hasPayload: boolean;
  messageId?: string;
  status: WebhookDeliveryStatus;
}): ResendBlock | null {
  if (!messageId) return 'resendNoMessage';
  if (!canWrite) return 'resendNoScope';
  if (status === 'sending') return 'resendSending';
  if (!hasPayload) return 'resendNoBody';
  return null;
}

interface WebhookDeliveryResendButtonProps {
  webhookId: string;
  messageId?: string;
  /** The delivery's current status, from its newest known attempt. */
  status: WebhookDeliveryStatus;
  /** False once the payload is known to be gone: a resend would be refused. */
  hasPayload: boolean;
  /** Called once the resend is queued, before the deliveries are read again. */
  onQueued: () => void;
}

/**
 * Resends a delivery, with no confirmation: it adds an attempt and changes
 * nothing else. A session without `write:webhooks` sees it disabled, with the
 * reason, as it does for a delivery that cannot be resent.
 */
export function WebhookDeliveryResendButton({
  webhookId,
  messageId,
  status,
  hasPayload,
  onQueued,
}: WebhookDeliveryResendButtonProps) {
  const { t } = useTranslation();
  const { isPending: scopesPending, scopes } = useGrantedScopes();
  const resend = useResendWebhookMessage({ onQueued });
  // Two presses in one frame both see the mutation idle: the ref does not.
  const sending = useRef(false);
  const block = getResendBlock({
    canWrite: scopesPending || hasScope(scopes, WRITE_WEBHOOKS_SCOPE),
    hasPayload,
    messageId,
    status,
  });

  function handleClick() {
    if (!messageId || sending.current) {
      return;
    }
    sending.current = true;
    resend.mutate(
      { webhookId, messageId },
      {
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }

  const button = (
    <Button
      disabled={block !== null || scopesPending || resend.isPending}
      onClick={handleClick}
      size="sm"
      type="button"
      variant="outline"
    >
      {resend.isPending ? (
        <Loader2 aria-hidden className="animate-spin" />
      ) : (
        <RotateCw aria-hidden />
      )}
      {t(resend.isPending ? `${DETAIL_KEY}.resending` : `${DETAIL_KEY}.resend`)}
    </Button>
  );

  if (block === null) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        }
      />
      <TooltipContent className="max-w-64">
        {t(`${DETAIL_KEY}.${block}`)}
      </TooltipContent>
    </Tooltip>
  );
}
