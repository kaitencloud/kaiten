import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { BillingProvider } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  ProviderBadge,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SettingsCardHeader } from '../../components/settings-card-header';

function ProviderRow({ provider }: { provider: BillingProvider }) {
  const { t } = useTranslation();
  const mayReadHandoff = useCanPerform('handoff.list');

  if (provider.kind === 'NOOP') {
    return (
      <li
        className="space-y-1.5 rounded-md border p-4"
        data-testid="billing-provider-noop"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ProviderBadge kind="NOOP" />
          <Badge variant="success">
            {t('Pages.Settings.Billing.Providers.available')}
          </Badge>
        </div>
        <p className="text-sm font-medium">
          {t('Pages.Settings.Billing.Providers.Noop.title')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('Pages.Settings.Billing.Providers.Noop.description')}
        </p>
        {mayReadHandoff ? (
          <Link
            className="text-sm underline underline-offset-4"
            to="/billing/handoff"
          >
            {t('Pages.Settings.Billing.Providers.Noop.handoff')}
          </Link>
        ) : null}
      </li>
    );
  }

  return (
    <li
      className="space-y-1.5 rounded-md border p-4"
      data-testid="billing-provider-stripe"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProviderBadge kind={provider.kind} />
        <Badge variant={provider.connected ? 'success' : 'outline'}>
          {t(
            provider.connected
              ? 'Pages.Settings.Billing.Providers.connected'
              : 'Pages.Settings.Billing.Providers.notConnected',
          )}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('Pages.Settings.Billing.Providers.Stripe.description')}
      </p>
    </li>
  );
}

function renderProvider(provider: BillingProvider) {
  return <ProviderRow key={provider.kind} provider={provider} />;
}

/**
 * Who collects the invoices of the organization. NoOp is always there: the
 * organization collects them itself, through the handoff queue, and there is
 * nothing to connect, which the card says rather than showing an empty list.
 * Stripe is listed only where the release ships it, and with its state alone:
 * connecting it is another screen. A provider the console does not know is not
 * listed.
 */
export function BillingProvidersCard() {
  const { t } = useTranslation();
  const { capabilities, has } = useBillingCapabilities();
  const providers = (capabilities?.providers ?? []).filter(
    ({ kind }) => kind === 'NOOP' || (kind === 'STRIPE' && has('stripe')),
  );

  return (
    <Card data-testid="billing-providers">
      <SettingsCardHeader
        description={t('Pages.Settings.Billing.Providers.description')}
        icon={dataModelIcons.invoice}
        title={t('Pages.Settings.Billing.Providers.title')}
      />
      <CardContent>
        <ul className="space-y-3">{providers.map(renderProvider)}</ul>
      </CardContent>
    </Card>
  );
}
