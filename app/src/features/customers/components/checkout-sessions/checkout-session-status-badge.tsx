import { useTranslation } from 'react-i18next';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CHECKOUT_SESSION_STATUS_LABEL_KEYS,
  type CheckoutSessionStatus,
} from '../../utils/checkout-session';

type Tone = { className?: string; variant: BadgeProps['variant'] };

const WARNING_TONE =
  'border-transparent bg-warning-subtle text-warning-subtle-foreground';
const DESTRUCTIVE_TONE =
  'border-transparent bg-destructive-subtle text-destructive-subtle-foreground';
const INFO_TONE =
  'border-info-subtle-foreground/30 bg-info-subtle text-info-subtle-foreground';

const TONES: Record<CheckoutSessionStatus, Tone> = {
  ABANDONED: { className: 'text-muted-foreground', variant: 'outline' },
  AWAITING_PAYMENT: { className: WARNING_TONE, variant: 'secondary' },
  COMPLETED: { variant: 'success' },
  // A tone of its own: a checkout waiting for its payment is still going, an expired one is over.
  EXPIRED: { className: DESTRUCTIVE_TONE, variant: 'secondary' },
  OPEN: { className: INFO_TONE, variant: 'outline' },
};

type CheckoutSessionStatusBadgeProps = {
  className?: string;
  status: CheckoutSessionStatus;
};

/**
 * Where an anonymous checkout stands, as the API reports it: it reads a checkout left
 * open past its expiry as abandoned, so the badge draws the status it is given and
 * derives nothing from the dates.
 */
export function CheckoutSessionStatusBadge({
  className,
  status,
}: CheckoutSessionStatusBadgeProps) {
  const { t } = useTranslation();
  const tone = TONES[status];

  return (
    <Badge
      className={cn(tone.className, className)}
      data-status={status}
      variant={tone.variant}
    >
      {t(CHECKOUT_SESSION_STATUS_LABEL_KEYS[status])}
    </Badge>
  );
}
