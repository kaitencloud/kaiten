import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getInvoiceStatusPresentation,
  type InvoiceStatusInput,
} from '../logic';
import { BadgeExplanation } from './badge-explanation';

type InvoiceStatusBadgeProps = {
  className?: string;
  invoice: InvoiceStatusInput;
  /** The instant "overdue" is judged at; now when left out. */
  now?: number;
};

/**
 * The status of an invoice, as text and as a tone, never as a colour alone. A
 * held DRAFT reads "Held" and says why on hover and on focus, an unpaid invoice
 * past its due date reads "Overdue", and a MANUAL one reads "Ready to bill",
 * which is not a failure.
 */
export function InvoiceStatusBadge({
  className,
  invoice,
  now,
}: InvoiceStatusBadgeProps) {
  const { t } = useTranslation();
  const presentation = getInvoiceStatusPresentation(invoice, now);

  return (
    <BadgeExplanation
      explanation={
        presentation.holdReasonKey ? t(presentation.holdReasonKey) : undefined
      }
    >
      <Badge
        className={cn(className)}
        data-status={invoice.status}
        variant={presentation.tone}
      >
        {t(presentation.labelKey)}
      </Badge>
    </BadgeExplanation>
  );
}
