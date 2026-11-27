import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { WebhookFormApi } from '../../hooks/use-webhook-form';
import { WebhookChatNotice } from './webhook-chat-notice';

type WebhookDestinationCardProps = {
  form: WebhookFormApi;
  className?: string;
};

/**
 * Where the events go. A Slack or Google Chat URL is a credential: the browser
 * is told not to remember it.
 */
export function WebhookDestinationCard({
  form,
  className,
}: WebhookDestinationCardProps) {
  const { t } = useTranslation();

  return (
    <Card className={cn('gap-4 py-5', className)}>
      <CardHeader className="px-5">
        <CardTitle>
          {t('Pages.Integrations.Webhooks.Form.destination.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        <form.AppField name="url">
          {(field) => (
            <field.TextField
              label={t('Pages.Integrations.Webhooks.Form.destination.urlLabel')}
              required
              placeholder={t(
                'Pages.Integrations.Webhooks.Form.destination.urlPlaceholder',
              )}
              description={t(
                'Pages.Integrations.Webhooks.Form.destination.urlDescription',
              )}
              type="url"
              inputMode="url"
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.url}>
          {(url) => <WebhookChatNotice url={url} />}
        </form.Subscribe>
      </CardContent>
    </Card>
  );
}
