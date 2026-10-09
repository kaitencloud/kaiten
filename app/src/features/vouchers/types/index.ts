/** A price a voucher can be limited to, with the version of a license or of an add-on it belongs to. */
export type PriceOption = {
  /** The amount and the period as the price is read everywhere: `$99.00/month`. */
  amount: string;
  deprecated: boolean;
  id: string;
  /** What the price is called. */
  label: string;
  /** The version it belongs to: the API gives a price no owner, so the console asks each one. */
  owner: string;
  /** Whether the version is a license's or an add-on's: the body names the two apart. */
  ownerKind: 'ADDON' | 'LICENSE';
};

/** The names a voucher refers to by id or slug, for the screens that write them out. */
export type VoucherNames = {
  /** Add-on versions, by id. */
  addons: Readonly<Record<string, string>>;
  /** Customers, by slug. */
  customers: Readonly<Record<string, string>>;
  /** Entitlements, by slug. */
  entitlements: Readonly<Record<string, string>>;
  /** License versions, by id. */
  licenses: Readonly<Record<string, string>>;
  /** Prices, by id. */
  prices: Readonly<Record<string, string>>;
};
