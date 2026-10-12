import { ATTIO_LOGO_ASSETS } from '@/domains/crm-sync';
import { STRIPE_CONNECTOR } from './stripe/constants';
import type { ConnectorMeta } from './types';

export { STRIPE_CONNECTOR };

/** Curated connector catalog. Attio and Stripe are wired; the rest are decorative. */
export const ATTIO_CONNECTOR: ConnectorMeta = {
  id: 'attio',
  name: 'Attio',
  tagline: 'Modern B2B CRM',
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
    tagline: 'CRM platform',
    group: 'CRM',
    status: 'coming-h1',
    tile: 'warning',
    initial: 'H',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    tagline: 'Enterprise CRM',
    group: 'CRM',
    status: 'coming-h2',
    tile: 'accent',
    initial: 'S',
  },
  STRIPE_CONNECTOR,
  {
    id: 'lago',
    name: 'Lago',
    tagline: 'Usage-based billing',
    group: 'Billing',
    status: 'coming-h1',
    tile: 'muted',
    initial: 'L',
  },
];
