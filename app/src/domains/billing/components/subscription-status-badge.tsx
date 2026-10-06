import { useTranslation } from 'react-i18next';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getSubscriptionStatusLabelKey,
  type SubscriptionStatus,
  type SubscriptionStatusInput,
} from '../logic';

type Tone = { className?: string; variant: BadgeProps['variant'] };

const STATUS_TONES: Record<SubscriptionStatus, Tone> = {
  TRIAL: {
    className:
      'border-info-subtle-foreground/30 bg-info-subtle text-info-subtle-foreground',
    variant: 'outline',
  },
  ACTIVE: { variant: 'success' },
  PAST_DUE: { variant: 'destructive' },
  CANCELED: { variant: 'outline' },
};

// A cancellation scheduled for the end of the period is a warning, not yet an end.
const CANCELLATION_SCHEDULED_TONE: Tone = {
  className:
    'border-transparent bg-warning-subtle text-warning-subtle-foreground',
  variant: 'secondary',
};

type SubscriptionStatusBadgeProps = {
  className?: string;
  subscription: SubscriptionStatusInput;
};

/** The state of a subscription, which reads as the cancellation when it is scheduled. */
export function SubscriptionStatusBadge({
  className,
  subscription,
}: SubscriptionStatusBadgeProps) {
  const { t } = useTranslation();
  const scheduled =
    subscription.cancelAtPeriodEnd && subscription.status !== 'CANCELED';
  const tone = scheduled
    ? CANCELLATION_SCHEDULED_TONE
    : STATUS_TONES[subscription.status];

  return (
    <Badge
      className={cn(tone.className, className)}
      data-status={subscription.status}
      variant={tone.variant}
    >
      {t(getSubscriptionStatusLabelKey(subscription))}
    </Badge>
  );
}
