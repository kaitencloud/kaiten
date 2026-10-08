import { useTranslation } from 'react-i18next';
import type { License, Price } from '@/api-client';
import {
  BILLING_TIMING_LABEL_KEYS,
  getPriceAmountParts,
  getPriceLabel,
  joinPriceAmount,
} from '@/domains/billing';

type PlanDescription = {
  /** What the plan charges, over what period: `$39.00/month`. */
  amount: string;
  /** When it is charged: in advance or in arrears. */
  timing: string;
  /** The name of the price: `Pro, monthly`. */
  price: string;
  /** The license version it belongs to: `Pro v3`. Absent when it is not known. */
  version: string | undefined;
};

/**
 * How a plan reads wherever one is named: the picker of a plan change, the banner
 * of a change that is scheduled, the summary of the plan the subscription is on.
 * It is the price, written as every price of the console is, and the license
 * version it belongs to when that is known.
 */
export function useDescribePlan() {
  const { i18n, t } = useTranslation();

  return (price: Price, license?: Pick<License, 'name' | 'version'>) =>
    ({
      amount: joinPriceAmount(
        getPriceAmountParts(price, undefined, t, i18n.language),
      ),
      price: getPriceLabel(price, undefined, t),
      timing: t(BILLING_TIMING_LABEL_KEYS[price.billingTiming]),
      version: license
        ? t('Pages.Customers.Instances.Detail.Billing.PlanChange.version', {
            name: license.name,
            version: license.version,
          })
        : undefined,
    }) satisfies PlanDescription;
}
