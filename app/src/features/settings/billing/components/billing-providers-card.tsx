import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { BillingProvider } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  getProviderStanding,
  ProviderBadge,
  STRIPE_CONNECTOR_ROUTE_ID,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { SettingsCardHeader } from '../../components/settings-card-header';
import { ProviderSyncLine } from './billing-provider-sync';

function NoopRow() {
  const { t } = useTranslation();
  const mayReadHandoff = useCanPerform('handoff.list');

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

/**
 * Stripe as the capabilities list it: connected (to a test or a live account),
 * free to be connected, or unable to be here, and why. Connecting it is the
 * connector's page, which the row leads to for a session that may read the settings
 * of the organization; where the connection is on, the row also says how the last pass
 * of Stripe went, since a pass that keeps failing means invoices that are not read back.
 */
function StripeRow({ provider }: { provider: BillingProvider }) {
  const { t } = useTranslation();
  const mayOpenConnector = useCanPerform('connector.settings.read');
  const standing = getProviderStanding(provider);
  const base = 'Pages.Settings.Billing.Providers.Stripe';

  function renderStatus() {
    switch (standing.state) {
      case 'connected':
        return (
          <>
            <Badge variant="success">
              {t('Pages.Settings.Billing.Providers.connected')}
            </Badge>
            {standing.livemode === undefined ? null : (
              <Badge
                data-mode={standing.livemode ? 'live' : 'test'}
                variant="outline"
              >
                {t(`${base}.Mode.${standing.livemode ? 'live' : 'test'}`)}
              </Badge>
            )}
          </>
        );
      case 'available':
        return (
          <Badge variant="outline">
            {t('Pages.Settings.Billing.Providers.notConnected')}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {t('Pages.Settings.Billing.Providers.unavailable')}
          </Badge>
        );
    }
  }

  const connectorLabel =
    standing.state === 'connected'
      ? t(`${base}.manage`)
      : standing.state === 'available'
        ? t(`${base}.connect`)
        : t(`${base}.why`);

  return (
    <li
      className="space-y-1.5 rounded-md border p-4"
      data-standing={standing.state}
      data-testid="billing-provider-stripe"
    >
      <div className="flex flex-wrap items-center gap-2">
        <ProviderBadge kind={provider.kind} />
        {renderStatus()}
      </div>
      <p className="text-sm text-muted-foreground">
        {t(`${base}.description`)}
      </p>
      {standing.state === 'unavailable' ? (
        <p
          className="text-sm text-muted-foreground"
          data-reason={standing.reason}
        >
          {t(`${base}.Unavailable.${standing.reason}`)}
        </p>
      ) : null}
      {standing.state === 'connected' ? (
        <ProviderSyncLine kind={provider.kind} />
      ) : null}
      {mayOpenConnector ? (
        <Link
          className="text-sm underline underline-offset-4"
          params={{ connectorId: STRIPE_CONNECTOR_ROUTE_ID }}
          to="/integrations/connectors/$connectorId"
        >
          {connectorLabel}
        </Link>
      ) : null}
    </li>
  );
}

function renderProvider(provider: BillingProvider) {
  return provider.kind === 'NOOP' ? (
    <NoopRow key={provider.kind} />
  ) : (
    <StripeRow key={provider.kind} provider={provider} />
  );
}

/**
 * Who collects the invoices of the organization, as the API lists its providers.
 * NoOp is always there: the organization collects the invoices itself, through the
 * handoff queue, and there is nothing to connect, which the card says rather than
 * showing an empty list. Stripe is there whenever the API lists it, with where it
 * stands for the organization; connecting it is the page of its connector. The
 * entries are read from the providers and never from the feature flags of the
 * capabilities, which say what the release ships and not what the organization can
 * connect here.
 */
export function BillingProvidersCard() {
  const { t } = useTranslation();
  const { capabilities } = useBillingCapabilities();
  const providers = capabilities?.providers ?? [];

  return (
    <Card data-testid="billing-providers">
      <SettingsCardHeader
        description={t('Pages.Settings.Billing.Providers.description')}
        icon={dataModelIcons.billing}
        title={t('Pages.Settings.Billing.Providers.title')}
      />
      <CardContent>
        <ul className="space-y-3">{providers.map(renderProvider)}</ul>
      </CardContent>
    </Card>
  );
}
