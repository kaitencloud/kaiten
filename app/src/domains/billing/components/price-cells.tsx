import { useTranslation } from 'react-i18next';
import type { Entitlement, Price } from '@/api-client';
import { Badge } from '@/components/ui/badge';
import { BILLING_MODEL_LABEL_KEYS } from '../logic/price-labels';
import {
  describeMeter,
  isMeteredModel,
  type MeterGrant,
  type OverageScope,
} from '../logic/price-meter';

/**
 * How a price is sold, as a badge: a flat fee, or what it rates. A table of prices
 * has this column for a license version and for an add-on version alike.
 */
export function PriceShapeCell({
  price,
}: {
  price: Pick<Price, 'billingModel'>;
}) {
  const { t } = useTranslation();

  return (
    <Badge
      variant={isMeteredModel(price.billingModel) ? 'secondary' : 'default'}
    >
      {t(BILLING_MODEL_LABEL_KEYS[price.billingModel])}
    </Badge>
  );
}

type PriceMeterCellProps = {
  entitlement?: Entitlement;
  /** What the version grants of the entitlement: the allowance an overage bills above. */
  grant?: MeterGrant;
  price: Pick<Price, 'billingModel' | 'metered'>;
  /** Whose allowance an overage bills above: a license version's grant, or the instance's. */
  scope?: OverageScope;
};

/**
 * What a metered price measures: the entitlement, then what it counts and when the
 * count starts again, or the allowance an overage bills above. A flat fee measures
 * nothing.
 */
export function PriceMeterCell({
  entitlement,
  grant,
  price,
  scope,
}: PriceMeterCellProps) {
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
        {describeMeter(price, entitlement, grant, t, i18n.language, scope)}
      </p>
    </div>
  );
}
