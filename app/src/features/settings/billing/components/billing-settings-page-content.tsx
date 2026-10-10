import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import {
  billingSettingsQueryOptions,
  RetryableProblem,
} from '@/domains/billing';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { BillingDefaultsCard } from './billing-defaults-card';
import { BillingHealthCard } from './billing-health-card';
import { BillingProvidersCard } from './billing-providers-card';
import { BillingRetentionCard } from './billing-retention-card';

/**
 * The billing settings of the organization: who collects its invoices, what needs
 * attention in billing, the defaults a subscription takes, and how long usage is
 * kept. The defaults are read
 * here, so that a refusal (a missing scope, the API down) is shown with a way to
 * ask again and the other cards, which the capabilities answer, stay.
 */
export function BillingSettingsPageContent() {
  const { t } = useTranslation();
  const query = useQuery(billingSettingsQueryOptions);
  const Icon = dataModelIcons.billing;

  function renderDefaults() {
    if (query.isPending) {
      return (
        <div
          aria-busy="true"
          aria-label={t('Pages.Settings.Billing.loading')}
          role="status"
        >
          <Skeleton className="h-72 w-full" />
        </div>
      );
    }
    if (query.isError) {
      return (
        <RetryableProblem
          data-testid="billing-settings-error"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      );
    }

    return <BillingDefaultsCard settings={query.data} />;
  }

  return (
    <Page layout="scroll">
      <Page.Fixed>
        <Page.Header>
          <Page.Leading>
            <Page.Icon>
              <Icon className="size-8 text-primary-subtle-foreground" />
            </Page.Icon>
            <Page.Heading>
              <Page.Title>{t('Pages.Settings.Billing.title')}</Page.Title>
              <Page.Subtitle>
                {t('Pages.Settings.Billing.subtitle')}
              </Page.Subtitle>
            </Page.Heading>
          </Page.Leading>
        </Page.Header>
      </Page.Fixed>
      <Page.Scroll className="mt-6" contentClassName="space-y-6">
        <BillingProvidersCard />
        <BillingHealthCard />
        {renderDefaults()}
        <BillingRetentionCard />
      </Page.Scroll>
    </Page>
  );
}
