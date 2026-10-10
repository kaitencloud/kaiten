import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { describeInvoiceLine } from '../logic';
import { BadgeExplanation } from './badge-explanation';

type InvoiceLineTypeBadgeProps = {
  className?: string;
  /** `InvoiceLine.type`: the contract leaves it open, so any string renders. */
  type: string;
};

/**
 * What an invoice line bills: base, add-on, usage, overage or discount. A type
 * this version of the console does not know reads "Other" and keeps the type it
 * was sent as on hover and on focus, rather than failing the whole invoice.
 */
export function InvoiceLineTypeBadge({
  className,
  type,
}: InvoiceLineTypeBadgeProps) {
  const { t } = useTranslation();
  const line = describeInvoiceLine({ type });

  return (
    <BadgeExplanation
      explanation={line.type === 'UNKNOWN' ? line.rawType : undefined}
    >
      <Badge
        className={cn('font-normal', className)}
        data-line-type={line.type}
        variant="outline"
      >
        {t(line.labelKey)}
      </Badge>
    </BadgeExplanation>
  );
}
