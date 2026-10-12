import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { LicenseWithPrices } from '../logic/license-catalogue';
import {
  getLicensePriceSummary,
  type LicensePriceSummary,
} from '../logic/license-price-summary';
import { PriceAmount } from './price-amount';

// What a summary with no amount says, typed against the kinds there are: no check
// reads a key built from a value at run time.
const WORDS = {
  custom: 'Features.Billing.LicensePriceSummary.custom',
  free: 'Features.Billing.LicensePriceSummary.free',
  unpriced: 'Features.Billing.LicensePriceSummary.unpriced',
} as const satisfies Record<
  Exclude<LicensePriceSummary['kind'], 'priced'>,
  string
>;

type LicensePriceSummaryTextProps = {
  className?: string;
  /** The version and its active prices; nothing is drawn without it. */
  license: Pick<LicenseWithPrices, 'prices' | 'pricingType'> | undefined;
};

/**
 * How a license version is sold, in a line: the flat fee of each billing period it
 * has ("$29.00/month · $290.00/year"), and usage billed on top, or that it is free
 * or sold on request. Amounts are the API's, written from the decimal string of the
 * price in the language of the app: nothing is added up and no monthly equivalent is
 * worked out. Nothing is drawn for a version whose pricing type the console does not
 * know.
 */
export function LicensePriceSummaryText({
  className,
  license,
}: LicensePriceSummaryTextProps) {
  const { t } = useTranslation();
  const summary = license ? getLicensePriceSummary(license) : null;

  if (!summary) {
    return null;
  }

  const wrap = (children: React.ReactNode) => (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground',
        className,
      )}
      data-summary={summary.kind}
      data-testid="license-price-summary"
    >
      {children}
    </span>
  );

  if (summary.kind !== 'priced') {
    return wrap(t(WORDS[summary.kind]));
  }

  return wrap(
    <>
      {summary.flatFees.map((price, index) => (
        <Fragment key={price.id}>
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          <PriceAmount price={price} />
        </Fragment>
      ))}
      {summary.usage
        ? t(
            summary.flatFees.length > 0
              ? 'Features.Billing.LicensePriceSummary.plusUsage'
              : 'Features.Billing.LicensePriceSummary.usage',
          )
        : null}
    </>,
  );
}
