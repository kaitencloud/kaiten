import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { Price } from '@/api-client';
import { useAddonPricing } from '../../hooks';
import { usePriceDrawerTarget } from '../../hooks/use-price-drawer-target';
import { FrozenVersionDialog } from '../frozen-version-dialog';
import { AddonPriceDrawer } from './addon-price-drawer';
import { AddonPricesCard } from './addon-prices-card';
import { DeprecateAddonPriceDialog } from './deprecate-addon-price-dialog';

type AddonPricesTabProps = {
  addonSlug: string;
  /** `new`, when the URL opens the drawer on a new price. */
  priceParam?: string;
};

/**
 * The prices of one add-on version: what it is billed for, per unit and period. Each
 * price is one billable concern and becomes one line of an invoice. A new price opens
 * in a drawer the URL controls; a deprecation asks first; and the way to a new
 * version, when the version cannot be changed where it is, is a dialog over the tab.
 * A price is never edited, so there is no drawer for one that exists.
 */
export function AddonPricesTab({ addonSlug, priceParam }: AddonPricesTabProps) {
  const navigate = useNavigate();
  const pricing = useAddonPricing(addonSlug);
  const drawer = usePriceDrawerTarget({
    canAdd: pricing.canAdd,
    priceParam,
  });
  const [toDeprecate, setToDeprecate] = useState<Price | null>(null);
  // What the API refused with when the version could not be changed any more.
  const [frozen, setFrozen] = useState<unknown>(null);

  const dropPrice = () =>
    void navigate({
      params: { addonSlug },
      search: (previous) => ({ ...previous, price: undefined }),
      to: '/catalog/addons/$addonSlug/prices',
    });

  return (
    <>
      <AddonPricesCard onDeprecate={setToDeprecate} pricing={pricing} />
      {drawer.isOpen ? (
        <AddonPriceDrawer
          onClose={dropPrice}
          onFrozen={(error) => {
            dropPrice();
            setFrozen(error);
          }}
          pricing={pricing}
        />
      ) : null}
      {drawer.shouldLeave ? (
        <Navigate
          params={{ addonSlug }}
          replace
          search={(previous) => ({ ...previous, price: undefined })}
          to="/catalog/addons/$addonSlug/prices"
        />
      ) : null}
      {frozen ? (
        <FrozenVersionDialog
          addon={pricing.addon}
          error={frozen}
          onClose={() => setFrozen(null)}
        />
      ) : null}
      {toDeprecate ? (
        <DeprecateAddonPriceDialog
          addonSlug={addonSlug}
          onClose={() => setToDeprecate(null)}
          price={toDeprecate}
        />
      ) : null}
    </>
  );
}
