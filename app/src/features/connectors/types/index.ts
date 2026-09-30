export type ConnectorId =
  | 'attio'
  | 'hubspot'
  | 'salesforce'
  | 'stripe'
  | 'lago';

export type ConnectorStatus =
  | 'connected'
  | 'available'
  | 'coming-h1'
  | 'coming-h2';

export type ConnectorTileTone =
  | 'primary'
  | 'accent'
  | 'muted'
  | 'success'
  | 'warning';

export type ConnectorLogo = {
  light: string;
  dark: string;
};

export type ConnectorMeta = {
  id: ConnectorId;
  name: string;
  tagline: string;
  group: 'CRM' | 'Billing';
  status: ConnectorStatus;
  tile: ConnectorTileTone;
  initial: string;
  logo?: ConnectorLogo;
};
