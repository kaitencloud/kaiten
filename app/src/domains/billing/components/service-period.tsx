import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatServicePeriod } from '../logic';

type ServicePeriodProps = {
  className?: string;
  /** Start of the period, included. */
  from: string | undefined;
  /** End of the period, excluded. */
  to: string | undefined;
};

/** A half-open period, in UTC: `Mar 1 – Apr 1, 2027 (UTC)`. */
export function ServicePeriod({ className, from, to }: ServicePeriodProps) {
  const { i18n } = useTranslation();

  return (
    <span className={cn('tabular-nums', className)}>
      {formatServicePeriod(from, to, i18n.language)}
    </span>
  );
}
