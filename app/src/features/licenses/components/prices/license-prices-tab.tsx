import { Navigate, useNavigate } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Price } from '@/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useActionAccess } from '@/domains/billing';
import { TableCard } from '@/functionals/table';
import { dataModelIcons } from '@/lib/data-model-icons';
import { useLicensePricing } from '../../hooks/use-license-pricing';
import { getPriceLabel } from '../../utils/license-price-display';
import { getPreviewBases } from '../../utils/license-price-preview.utils';
import { canEditPrice } from '../../utils/license-price.utils';
import { DeprecatePriceDialog } from './deprecate-price-dialog';
import { LicenseInvoicePreviewDialog } from './license-invoice-preview-dialog';
import { LicensePricesActions } from './license-prices-actions';
import { PriceDrawer } from './price-drawer';
import { PriceSummary } from './price-summary';
import { PriceTable } from './price-table';

const PriceIcon = dataModelIcons.price;

type LicensePricesTabProps = {
  licenseSlug: string;
  /** `new`, or the id of the price the URL opens the drawer on. */
  priceParam?: string;
};

// What the state of the version says about its prices, so that a price that
// cannot be edited is never a surprise.
const STATE_NOTE_KEYS = {
  ARCHIVED: 'Pages.Licenses.Prices.Notes.archived',
  DRAFT: 'Pages.Licenses.Prices.Notes.draft',
  PUBLISHED: 'Pages.Licenses.Prices.Notes.published',
} as const;

/**
 * The prices of one license version: what it bills, as a line a person reads
 * and as the table of its prices, and what can be done to them. Each price is
 * one billable concern and becomes one line of an invoice. A new price or an
 * edit opens in a drawer the URL controls; a deprecation asks first.
 */
export function LicensePricesTab({
  licenseSlug,
  priceParam,
}: LicensePricesTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pricing = useLicensePricing(licenseSlug);
  const { entitlementBySlug, grantBySlug, prices, rules } = pricing;
  const create = useActionAccess('licensePrices.create');
  const update = useActionAccess('licensePrices.update');
  const mayCreate = create.allowed;
  const mayUpdate = update.allowed;
  const [toDeprecate, setToDeprecate] = useState<Price | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const closeDrawer = () => {
    void navigate({
      params: { licenseSlug },
      to: '/licenses/$licenseSlug/prices',
    });
  };

  const adding = priceParam === 'new' && mayCreate && rules.canAdd;
  const editing =
    priceParam && priceParam !== 'new'
      ? prices.find((price) => price.id === priceParam)
      : undefined;
  const mayEdit =
    editing !== undefined && mayUpdate && canEditPrice(rules, editing);
  // A link to a drawer that cannot open (an unknown price, a published version, a
  // session that may not write) leads to the tab, not to a drawer left blank. It
  // is kept while the scopes of the session are being read: they are not known
  // yet, and a link followed from outside must not be dropped for that.
  const unopenable =
    !create.isPending && priceParam !== undefined && !adding && !mayEdit;
  const toDeprecateLabel = toDeprecate
    ? getPriceLabel(
        toDeprecate,
        toDeprecate.metered
          ? entitlementBySlug.get(toDeprecate.metered.entitlementSlug)
          : undefined,
        t,
      )
    : '';

  return (
    <>
      <TableCard>
        <TableCard.Header>
          <TableCard.HeaderLeading>
            <TableCard.HeaderIcon>
              <PriceIcon />
            </TableCard.HeaderIcon>
            <TableCard.HeaderHeading>
              <TableCard.HeaderTitle>
                {t('Pages.Licenses.Prices.title')}
              </TableCard.HeaderTitle>
              <TableCard.HeaderSubtitle>
                {t('Pages.Licenses.Prices.tabDescription')}
              </TableCard.HeaderSubtitle>
            </TableCard.HeaderHeading>
          </TableCard.HeaderLeading>
          <LicensePricesActions
            canPreview={getPreviewBases(prices).length > 0}
            licenseSlug={licenseSlug}
            onPreview={() => setPreviewing(true)}
            rules={rules}
          />
        </TableCard.Header>
        <div className="space-y-3 px-6 pb-3">
          <PriceSummary
            className="text-sm font-medium"
            entitlementBySlug={entitlementBySlug}
            prices={prices}
          />
          <Alert>
            <Lock />
            <AlertDescription>
              {t(STATE_NOTE_KEYS[rules.state])}
            </AlertDescription>
          </Alert>
        </div>
        <TableCard.Content>
          <PriceTable
            entitlementBySlug={entitlementBySlug}
            grantBySlug={grantBySlug}
            licenseSlug={licenseSlug}
            onDeprecate={setToDeprecate}
            prices={prices}
            rules={rules}
          />
        </TableCard.Content>
      </TableCard>
      {adding || (mayEdit && editing) ? (
        <PriceDrawer
          licenseSlug={licenseSlug}
          onClose={closeDrawer}
          price={mayEdit ? editing : undefined}
          pricing={pricing}
        />
      ) : null}
      {unopenable ? (
        <Navigate
          params={{ licenseSlug }}
          replace
          to="/licenses/$licenseSlug/prices"
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
          label={toDeprecateLabel}
          licenseSlug={licenseSlug}
          onClose={() => setToDeprecate(null)}
          price={toDeprecate}
        />
      ) : null}
    </>
  );
}
