import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getProviderKindLabelKey, type InvoiceProviderKind } from '../logic';

type ProviderBadgeProps = {
  className?: string;
  kind: InvoiceProviderKind;
};

/** Who collects an invoice: Stripe, or NoOp, the organization itself through the handoff queue. */
export function ProviderBadge({ className, kind }: ProviderBadgeProps) {
  const { t } = useTranslation();

  return (
    <Badge
      className={cn('font-normal', className)}
      data-provider={kind}
      variant="outline"
    >
      {t(getProviderKindLabelKey(kind))}
    </Badge>
  );
}
