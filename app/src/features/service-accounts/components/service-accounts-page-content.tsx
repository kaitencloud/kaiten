import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { serviceAccountsQueryOptions } from '../queries';
import { ServiceAccountList } from './service-account-list';

type ServiceAccountsPageContentProps = {
  /** Route-driven dialog slotted over the page (e.g. the create dialog). */
  children?: ReactNode;
};

export function ServiceAccountsPageContent({
  children,
}: ServiceAccountsPageContentProps) {
  const { t } = useTranslation();
  const ServiceAccountIcon = dataModelIcons.serviceAccount;
  const { data: serviceAccounts } = useSuspenseQuery(
    serviceAccountsQueryOptions,
  );

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <ServiceAccountIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>
              {t('Pages.Integrations.ServiceAccounts.title')}
            </Page.Title>
            <Page.Subtitle>
              {t('Pages.Integrations.ServiceAccounts.description')}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>

      <div className="mt-6 flex-1 min-h-0">
        <ServiceAccountList serviceAccounts={serviceAccounts?.items ?? []} />
      </div>

      {children}
    </Page>
  );
}
