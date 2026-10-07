import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, LicenseEntitlement, Price } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { formatUtcDate } from '@/domains/billing';
import {
  BILLING_MODEL_LABEL_KEYS,
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  PRICE_STATUS_LABEL_KEYS,
} from '../../utils/license-price-labels';
import { getPriceLabel } from '../../utils/license-price-display';
import { describeMeter } from '../../utils/license-price-meter';
import { isMeteredModel } from '../../utils/license-price.utils';

// A price with no label of its own is shown under what it bills, as the API
// words the line of an invoice: the meter's name, "Traces, overage" for an
// overage, and the model for a flat fee.
export function PriceLabelCell({
  entitlement,
  price,
}: {
  entitlement?: Entitlement;
  price: Price;
}) {
  const { t } = useTranslation();
  const label = getPriceLabel(price, entitlement, t);

  return (
    <div className="flex flex-wrap items-center gap-2 whitespace-normal">
      <span className="font-medium">{label}</span>
      {price.isDefault ? (
        <Badge className="gap-1" variant="default">
          <Star className="size-3" />
          {t('Pages.Licenses.Prices.defaultBadge')}
        </Badge>
      ) : null}
    </div>
  );
}

export function PriceShapeCell({ price }: { price: Price }) {
  const { t } = useTranslation();

  return (
    <Badge
      variant={isMeteredModel(price.billingModel) ? 'secondary' : 'default'}
    >
      {t(BILLING_MODEL_LABEL_KEYS[price.billingModel])}
    </Badge>
  );
}

export function PriceMeterCell({
  entitlement,
  grant,
  price,
}: {
  entitlement?: Entitlement;
  grant?: LicenseEntitlement;
  price: Price;
}) {
  const { i18n, t } = useTranslation();
  if (!price.metered) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    // A cell of the table does not wrap, and what an overage bills against is a
    // sentence: left alone it widens the table beyond the page.
    <div className="max-w-64 min-w-0 whitespace-normal">
      <p className="truncate">
        {entitlement?.name ?? price.metered.entitlementSlug}
      </p>
      <p className="text-xs text-muted-foreground">
        {describeMeter(price, entitlement, grant, t, i18n.language)}
      </p>
    </div>
  );
}

// A flat fee is billed for a period, in advance unless it says otherwise; a
// metered price is billed on the subscription's own period, in arrears.
export function PriceBilledCell({ price }: { price: Price }) {
  const { t } = useTranslation();
  const timing = t(BILLING_TIMING_LABEL_KEYS[price.billingTiming]);

  return (
    <span>
      {price.billingPeriod
        ? `${t(BILLING_PERIOD_LABEL_KEYS[price.billingPeriod])} · ${timing}`
        : timing}
    </span>
  );
}

export function PriceStatusCell({ price }: { price: Price }) {
  const { i18n, t } = useTranslation();

  return (
    <div className="space-y-0.5 whitespace-normal">
      <Badge variant={price.status === 'ACTIVE' ? 'success' : 'outline'}>
        {t(PRICE_STATUS_LABEL_KEYS[price.status])}
      </Badge>
      {price.deprecatedAt ? (
        <p className="text-xs text-muted-foreground">
          {t('Pages.Licenses.Prices.deprecatedOn', {
            date: formatUtcDate(price.deprecatedAt, i18n.language),
          })}
        </p>
      ) : null}
    </div>
  );
}
