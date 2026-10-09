import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';

/**
 * Where a stock is sold, under the entitlements a price cannot meter: as an add-on,
 * with a quantity. The sentence is always there. It links to the add-ons only where
 * there are some to open, which is where the release ships them and the session may
 * read them; elsewhere it names the way and leads nowhere.
 */
export function PriceStockHint() {
  const { t } = useTranslation();
  const { has } = useBillingCapabilities();
  const mayOpenAddons = useCanPerform('addons.list');

  return (
    <p className="text-xs text-muted-foreground">
      {t('Pages.Licenses.Prices.Form.Meter.stockHint')}
      {has('addons') && mayOpenAddons ? (
        <>
          {' '}
          <Link className="underline underline-offset-4" to="/catalog/addons">
            {t('Pages.Licenses.Prices.Form.Meter.stockHintLink')}
          </Link>
        </>
      ) : null}
    </p>
  );
}
