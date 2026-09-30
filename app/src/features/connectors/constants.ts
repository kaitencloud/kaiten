import { ATTIO_LOGO_ASSETS } from '@/domains/crm-sync';
import type { ConnectorMeta } from './types';

/** Curated connector catalog. Only Attio is wired; the rest are decorative. */
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
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Subscription billing',
    group: 'Billing',
    status: 'coming-h1',
    tile: 'success',
    initial: 'S',
  },
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
