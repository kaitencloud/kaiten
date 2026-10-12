import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Entitlement, Price } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import {
  formatUtcDate,
  BILLING_PERIOD_LABEL_KEYS,
  BILLING_TIMING_LABEL_KEYS,
  PRICE_STATUS_LABEL_KEYS,
  getPriceLabel,
} from '@/domains/billing';

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
