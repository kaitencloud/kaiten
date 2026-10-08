import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import {
  getMeterOptions,
  type MeterOption,
  sortMeterOptions,
} from '../../utils/license-price.utils';
import { type BillingModel } from '@/domains/billing';

/** What the form of a price reads of the version to offer what it may meter. */
export type PriceMeterSource = {
  /** The price being edited, which keeps the meter it already has. */
  editingPriceId?: string;
  entitlements: readonly Entitlement[];
  grants: readonly LicenseEntitlement[];
  prices: readonly Price[];
};

/** The picker's options for a shape: flows first, then the stocks, disabled. */
export const meterOptionsFor = (
  source: PriceMeterSource,
  model: BillingModel,
): MeterOption[] => sortMeterOptions(getMeterOptions({ ...source, model }));

/** The option that can be picked for `slug`, if there is one. */
export const pickableOption = (options: MeterOption[], slug: string) =>
  options.find(
    (option) =>
      option.entitlementSlug === slug && option.disabledReason === undefined,
  );
