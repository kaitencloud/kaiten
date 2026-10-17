import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { OverageScope } from '../logic/price-meter';
import { useBillingCapabilities } from '../queries/billing-capabilities';
import { useCanPerform } from '../hooks/use-can-perform';

/**
 * Where a stock is sold, under the entitlements a price cannot meter: as an add-on,
 * with a quantity. The sentence is always there. It links to the add-ons only where
 * there are some to open, which is where the release ships them and the session may
 * read them; elsewhere it names the way and leads nowhere. On the price of an add-on,
 * which is that sale, it says to bill the stock as a flat fee with a quantity.
 */
export function PriceStockHint({
  scope = 'license',
}: {
  scope?: OverageScope;
}) {
  const { t } = useTranslation();
  const { has } = useBillingCapabilities();
  const mayOpenAddons = useCanPerform('addons.list');

  // The price of an add-on is where a stock is sold: there is nowhere to lead to.
  if (scope === 'instance') {
    return (
      <p className="text-xs text-muted-foreground">
        {t('Features.Billing.Price.Meter.stockHintAddon')}
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      {t('Features.Billing.Price.Meter.stockHint')}
      {has('addons') && mayOpenAddons ? (
        <>
          {' '}
          <Link className="underline underline-offset-4" to="/catalog/addons">
            {t('Features.Billing.Price.Meter.stockHintLink')}
          </Link>
        </>
      ) : null}
    </p>
  );
}
