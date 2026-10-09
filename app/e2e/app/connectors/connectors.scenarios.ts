import { BillingAppModel } from '../_support/model/billing-app-model';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../_support/model/billing-capabilities';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing/logic/billing-providers';
import { ConnectorAppModel } from '../_support/model/connector-app-model';
import { createStripeBillingModel } from '../billing/billing.scenarios';

export function createDisconnectedAttioModel() {
  return new ConnectorAppModel({
    syncedRecords: {
      customers: {
        items: [
          {
            id: 'customer-1',
            integrations: {
              'kaiten.integration.crm.attio': {
                external_id: 'attio-company-1',
                last_error: null,
                synced_at: '2026-06-11T12:00:00Z',
              },
            },
            name: 'Acme Corp',
            slug: 'acme-corp',
          },
        ],
      },
      instances: {
        items: [
          {
            id: 'instance-1',
            integrations: {
              'kaiten.integration.crm.attio': {
                external_id: 'attio-workspace-1',
                last_error: null,
                synced_at: '2026-06-11T12:05:00Z',
              },
            },
            name: 'Acme Production',
            slug: 'acme-production',
          },
        ],
      },
    },
  });
}

/**
 * The Stripe connector with the billing it configures, as one organization has
 * them. Where the connector stands is `standing`: `available` has no key stored yet;
 * `connected` has a restricted key of a test account (`connectedLive`, of the live
 * account) and the options it was saved with; `notEntitled` and `vaultMissing` are
 * the two reasons it cannot be connected. Stripe holds customers and invoices of the
 * organization when it is connected, so it cannot be disconnected: `withoutRouting`
 * starts from a connector nothing routes to.
 */
export function createStripeConnectorModels(
  options: {
    /** What the connector was saved with; the defaults of its schema otherwise. */
    settings?: {
      autoFinalize: boolean;
      automaticTax: boolean;
      taxBehavior: 'EXCLUSIVE' | 'INCLUSIVE';
    };
    standing?: StripeStanding;
    withoutRouting?: boolean;
  } = {},
) {
  const standing = options.standing ?? 'available';
  const connected = standing === 'connected' || standing === 'connectedLive';
  const settings = options.settings ?? {
    autoFinalize: true,
    automaticTax: false,
    taxBehavior: 'EXCLUSIVE',
  };
  const billing = options.withoutRouting
    ? new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.stackWithStripe(standing),
      })
    : createStripeBillingModel({ standing });
  const connectors = new ConnectorAppModel({
    stripe: connected
      ? {
          activated: true,
          livemode: standing === 'connectedLive',
          settings: {
            connector_name: STRIPE_CONNECTOR_NAME,
            settings: { ...settings, stripeSecretKey: '***' },
          },
        }
      : { activated: false, livemode: false, settings: null },
  });

  return { billing, connectors };
}
