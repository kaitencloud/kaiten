import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

type MoneyProps = {
  /** An integer in the currency's minor units, as the API sends it. */
  amount: number | bigint;
  className?: string;
  /** The ISO 4217 code. */
  currency: string;
};

/**
 * An amount of money, written in the language of the app. The amount is a field
 * of the API: the console never computes one.
 */
export function Money({ amount, className, currency }: MoneyProps) {
  const { i18n } = useTranslation();

  return (
    <span className={cn('tabular-nums', className)}>
      {formatMoney(currency, amount, i18n.language)}
    </span>
  );
}
