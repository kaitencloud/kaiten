import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { useBillingCapabilities } from '@/domains/billing';
import { SettingsCardHeader } from '../../components/settings-card-header';

/**
 * How long the usage behind an invoice is kept, and how long a report's
 * transaction id is remembered: what the deployment says of itself, so that
 * nothing here is edited. Past the retention an invoice keeps a fingerprint of the
 * reports it was measured from, and the history of an instance reaches no further.
 */
export function BillingRetentionCard() {
  const { t } = useTranslation();
  const { capabilities } = useBillingCapabilities();
  const months = capabilities?.usageHistoryRetentionMonths;
  const days = capabilities?.usageIdempotencyWindowDays;

  return (
    <Card data-testid="billing-retention">
      <SettingsCardHeader
        description={t('Pages.Settings.Billing.Retention.description')}
        icon={History}
        title={t('Pages.Settings.Billing.Retention.title')}
      />
      <CardContent className="space-y-2 text-sm">
        <p data-testid="billing-retention-months">
          {months === undefined || months === null
            ? t('Pages.Settings.Billing.Retention.unlimited')
            : t('Pages.Settings.Billing.Retention.months', { count: months })}
        </p>
        {days === undefined ? null : (
          <p className="text-muted-foreground">
            {t('Pages.Settings.Billing.Retention.idempotency', { count: days })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
