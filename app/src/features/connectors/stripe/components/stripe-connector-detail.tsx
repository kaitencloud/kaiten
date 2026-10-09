import { useTranslation } from 'react-i18next';
import type { ConnectorSettings } from '@/api-client';
import { useActionAccess, useBillingProvider } from '@/domains/billing';
import { Page } from '@/functionals/page';
import { readStripeSettings } from '../utils/stripe-settings';
import { StripeDisconnectDialog } from './stripe-disconnect-dialog';
import { StripeHeader } from './stripe-header';
import { StripeOverview } from './stripe-overview';
import { StripeSettingsCard } from './stripe-settings-card';
import { StripeStandingNotice } from './stripe-standing-notice';

type StripeConnectorDetailProps = {
  /** What the connector stores, key redacted; none before it is connected. */
  stripeSettings: ConnectorSettings | null;
};

/**
 * The page of the Stripe connector: where it stands for the organization (connected
 * to a test or a live account, or why it cannot be), the connection form and, once
 * connected, the way out. The standing is read from the billing capabilities, which
 * list Stripe with whether it is available, connected, and which account it reaches;
 * the settings are the connector's own and say whether a key is on file. The route
 * loads the capabilities before the page opens, so the standing is known on arrival.
 */
export function StripeConnectorDetail({
  stripeSettings,
}: StripeConnectorDetailProps) {
  const { t } = useTranslation();
  const { isPending, standing: listed } = useBillingProvider('STRIPE');
  const { allowed: mayDisconnect } = useActionAccess('connector.deactivate');
  const settings = readStripeSettings(stripeSettings);
  // Until the capabilities are in, nothing is known of where Stripe stands: the page
  // claims neither that it is unavailable nor that it can be connected.
  const standing = isPending ? undefined : listed;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <StripeHeader
        actions={mayDisconnect ? <StripeDisconnectDialog /> : undefined}
        standing={standing}
      />
      {/* The page scrolls here. Where nothing in it can be focused (a connector that
          cannot be connected), a keyboard reaches the rest only by focusing the region. */}
      <div
        aria-label={t('Pages.Integrations.Connectors.Stripe.title')}
        className="mt-6 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        role="region"
        tabIndex={0}
      >
        <StripeStandingNotice standing={standing} />
        <StripeSettingsCard settings={settings} standing={standing} />
        <StripeOverview />
      </div>
    </Page>
  );
}
