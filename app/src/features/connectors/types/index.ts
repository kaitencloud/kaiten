export type ConnectorId = 'attio' | 'hubspot' | 'stripe';

export type ConnectorStatus =
  | 'connected'
  | 'available'
  /** Shipped, and not usable here: the organization cannot connect it. */
  | 'unavailable'
  /** Announced, not shipped yet: drawn in the catalog and never opened. */
  | 'coming-soon';

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
  /** What the connector does, in a few words, under its name: a translation key. */
  tagline: string;
  group: 'CRM' | 'Billing';
  status: ConnectorStatus;
  tile: ConnectorTileTone;
  initial: string;
  logo?: ConnectorLogo;
  /** Why an `unavailable` connector is, written under its tagline: a translation key. */
  note?: string;
};
