import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatServicePeriod } from '../logic';

type ServicePeriodProps = {
  className?: string;
  /** Start of the period, included. */
  from: string | undefined;
  /**
   * Puts the two ends one above the other, the dash ending the first line: for a
   * cell of a table, where a period that carries the time of day is wider than
   * any other column.
   */
  stacked?: boolean;
  /** End of the period, excluded. */
  to: string | undefined;
};

// The dash of a range, with the thin spaces a locale writes around it.
const RANGE_DASH = /(\s*\u2013)\s*/;

/** A half-open period, in UTC: `Mar 1 – Apr 1, 2027 (UTC)`. */
export function ServicePeriod({
  className,
  from,
  stacked = false,
  to,
}: ServicePeriodProps) {
  const { i18n } = useTranslation();
  const text = formatServicePeriod(from, to, i18n.language);
  // [start, dash, end]: a text with no dash (a period with no end to show) stays one line.
  const ends = stacked ? text.split(RANGE_DASH) : [];

  return (
    <span className={cn('tabular-nums', className)}>
      {ends.length === 3 ? (
        <>
          <span className="block">
            {ends[0]}
            {ends[1]}
          </span>
          <span className="block whitespace-nowrap">{ends[2]}</span>
        </>
      ) : (
        text
      )}
    </span>
  );
}
