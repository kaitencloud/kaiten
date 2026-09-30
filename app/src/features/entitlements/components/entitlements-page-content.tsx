import { useSuspenseQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { entitlementsQueryOptions } from '../queries';
import { EntitlementsTable } from './entitlement-table';

export function EntitlementsPageContent({
  children,
}: {
  children?: ReactNode;
}) {
  const { data: entitlements } = useSuspenseQuery(entitlementsQueryOptions);
  const { t } = useTranslation();
  const EntitlementIcon = dataModelIcons.entitlement;

  return (
    <>
      <Page className="h-full min-h-0 overflow-hidden">
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <EntitlementIcon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Entitlements.title')}</Page.Title>
              <Page.Subtitle>{t('Pages.Entitlements.subtitle')}</Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>
        <div className="flex-1 min-h-0">
          <EntitlementsTable entitlements={entitlements?.items ?? []} />
        </div>
      </Page>

      {children}
    </>
  );
}
