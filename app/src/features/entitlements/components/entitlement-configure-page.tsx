import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { Page } from '@/functionals/page';
import { EntitlementForm } from './entitlement-form';

type EntitlementConfigurePageProps = {
  entitlement: Entitlement;
};

export function EntitlementConfigurePage({
  entitlement,
}: EntitlementConfigurePageProps) {
  const { t } = useTranslation();

  return (
    <Page className="space-y-6">
      <Page.Header>
        <Page.Title>{t('Pages.Entitlements.Mutation.titleUpdate')}</Page.Title>
      </Page.Header>
      <EntitlementForm entitlement={entitlement} />
    </Page>
  );
}
