import { Navigate, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { Price } from '@/api-client';
import { useLicensePricing } from '../../hooks/use-license-pricing';
import { usePriceDrawerTarget } from '../../hooks/use-price-drawer-target';
import { NewVersionDialog } from '../new-version-dialog';
import { DeprecatePriceDialog } from './deprecate-price-dialog';
import { LicenseInvoicePreviewDialog } from './license-invoice-preview-dialog';
import { LicensePricesCard } from './license-prices-card';
import { PriceDrawer } from './price-drawer';

type LicensePricesTabProps = {
  /** The version whose prices were being copied to this one, when a copy stopped. */
  copyFrom?: string;
  licenseSlug: string;
  /** `new`, or the id of the price the URL opens the drawer on. */
  priceParam?: string;
};

/**
 * The prices of one license version: what it bills and what can be done to its
 * prices. Each price is one billable concern and becomes one line of an invoice.
 * A new price or an edit opens in a drawer the URL controls; a deprecation asks
 * first; the preview of the invoice they make up and the way to a new version,
 * when a price cannot be changed where it is, are dialogs over the tab.
 */
export function LicensePricesTab({
  copyFrom,
  licenseSlug,
  priceParam,
}: LicensePricesTabProps) {
  const navigate = useNavigate();
  const pricing = useLicensePricing(licenseSlug);
  const { entitlementBySlug, prices, rules } = pricing;
  const drawer = usePriceDrawerTarget({ priceParam, prices, rules });
  const [toDeprecate, setToDeprecate] = useState<Price | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // What the API refused with when the version could not be changed any more.
  const [frozen, setFrozen] = useState<unknown>(null);

  // The tab keeps the rest of its search (the copy that stopped) when it drops
  // what it was asked for.
  const dropSearch = (key: 'copyFrom' | 'price') =>
    void navigate({
      params: { licenseSlug },
      search: (previous) => ({ ...previous, [key]: undefined }),
      to: '/catalog/licenses/$licenseSlug/prices',
    });

  return (
    <>
      <LicensePricesCard
        copyFrom={copyFrom}
        licenseSlug={licenseSlug}
        onCopyDone={() => dropSearch('copyFrom')}
        onDeprecate={setToDeprecate}
        onPreview={() => setPreviewing(true)}
        pricing={pricing}
      />
      {drawer.isOpen ? (
        <PriceDrawer
          licenseSlug={licenseSlug}
          onClose={() => dropSearch('price')}
          onFrozen={(error) => {
            dropSearch('price');
            setFrozen(error);
          }}
          price={drawer.price}
          pricing={pricing}
        />
      ) : null}
      {drawer.shouldLeave ? (
        <Navigate
          params={{ licenseSlug }}
          replace
          search={(previous) => ({ ...previous, price: undefined })}
          to="/catalog/licenses/$licenseSlug/prices"
        />
      ) : null}
      {frozen ? (
        <NewVersionDialog
          error={frozen}
          licenseSlug={licenseSlug}
          onClose={() => setFrozen(null)}
        />
      ) : null}
      {previewing ? (
        <LicenseInvoicePreviewDialog
          licenseSlug={licenseSlug}
          onClose={() => setPreviewing(false)}
          pricing={pricing}
        />
      ) : null}
      {toDeprecate ? (
        <DeprecatePriceDialog
          entitlementBySlug={entitlementBySlug}
          licenseSlug={licenseSlug}
          onClose={() => setToDeprecate(null)}
          price={toDeprecate}
        />
      ) : null}
    </>
  );
}
