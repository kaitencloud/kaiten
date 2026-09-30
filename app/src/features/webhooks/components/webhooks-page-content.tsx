import { Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { WebhooksTabs } from './webhooks-tabs';

type WebhooksPageContentProps = {
  children?: ReactNode;
};

export function WebhooksPageContent({ children }: WebhooksPageContentProps) {
  const { t } = useTranslation();

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <Webhook className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>
              {t('Pages.Integrations.Webhooks.sectionTitle')}
            </Page.Title>
            <Page.Subtitle>
              {t('Pages.Integrations.Webhooks.pageDescription')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <WebhooksTabs />
      <div className="mt-6 flex-1 min-h-0">{children}</div>
    </Page>
  );
}
