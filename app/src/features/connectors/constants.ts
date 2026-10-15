import { ATTIO_LOGO_ASSETS } from '@/domains/crm-sync';
import { STRIPE_CONNECTOR } from './stripe/constants';
import type { ConnectorMeta } from './types';

export { STRIPE_CONNECTOR };

/** Curated connector catalog. Attio and Stripe are wired; HubSpot is announced. */
export const ATTIO_CONNECTOR: ConnectorMeta = {
  id: 'attio',
  name: 'Attio',
  tagline: 'Pages.Integrations.Connectors.Taglines.attio',
  group: 'CRM',
  status: 'available',
  tile: 'primary',
  initial: 'A',
  logo: ATTIO_LOGO_ASSETS,
};

export const CONNECTORS: ConnectorMeta[] = [
  ATTIO_CONNECTOR,
  {
    id: 'hubspot',
    name: 'HubSpot',
    tagline: 'Pages.Integrations.Connectors.Taglines.hubspot',
    group: 'CRM',
    status: 'coming-soon',
    tile: 'warning',
    initial: 'H',
  },
  STRIPE_CONNECTOR,
];
