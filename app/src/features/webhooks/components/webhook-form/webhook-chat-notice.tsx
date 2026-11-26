import { Info } from 'lucide-react';
import { useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  detectWebhookChatService,
  WEBHOOK_CHAT_SERVICE_NAMES,
} from '../../utils/webhook-chat-destination';

/**
 * Says, under the URL, that a Slack or Google Chat incoming webhook receives
 * chat messages rather than the raw event. A polite status, not an alert: it
 * appears while the person types.
 */
export function WebhookChatNotice({ url }: { url: string }) {
  const { t } = useTranslation();
  const service = detectWebhookChatService(useDeferredValue(url));

  if (!service) {
    return null;
  }

  return (
    <Alert role="status">
      <Info aria-hidden />
      <AlertTitle>
        {t('Pages.Integrations.Webhooks.Form.destination.chatNoticeTitle')}
      </AlertTitle>
      <AlertDescription>
        {t('Pages.Integrations.Webhooks.Form.destination.chatNotice', {
          service: WEBHOOK_CHAT_SERVICE_NAMES[service],
        })}
      </AlertDescription>
    </Alert>
  );
}
