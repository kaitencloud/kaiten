import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getRedemptionStatus,
  getRedemptionStatusLabelKey,
  getVoucherStatusLabelKey,
  getVoucherTypeLabelKey,
  type RedemptionStatus,
  type VoucherStatus,
  type VoucherType,
} from '../logic';

type Tone = { className?: string; variant: BadgeProps['variant'] };

const WARNING_TONE =
  'border-transparent bg-warning-subtle text-warning-subtle-foreground';
const INFO_TONE =
  'border-info-subtle-foreground/30 bg-info-subtle text-info-subtle-foreground';

const VOUCHER_TONES: Record<VoucherStatus, Tone> = {
  ACTIVE: { variant: 'success' },
  ARCHIVED: { className: 'text-muted-foreground', variant: 'outline' },
  DRAFT: { variant: 'outline' },
  EXHAUSTED: { className: INFO_TONE, variant: 'outline' },
  EXPIRED: { className: WARNING_TONE, variant: 'secondary' },
};

const REDEMPTION_TONES: Record<RedemptionStatus, Tone> = {
  ACTIVE: { variant: 'success' },
  EXPIRED: { variant: 'secondary' },
  REVOKED: { variant: 'destructive' },
};

type VoucherStatusBadgeProps = {
  className?: string;
  voucher: Pick<Voucher, 'status'>;
};

/**
 * The state of a voucher, as the API stores it: it sets a voucher EXPIRED once its end
 * has passed and EXHAUSTED with the redemption that reaches its maximum, so the badge
 * draws the stored status and derives nothing from the window or the count.
 */
export function VoucherStatusBadge({
  className,
  voucher,
}: VoucherStatusBadgeProps) {
  const { t } = useTranslation();
  const { status } = voucher;
  const tone = VOUCHER_TONES[status];

  return (
    <Badge
      className={cn(tone.className, className)}
      data-status={status}
      variant={tone.variant}
    >
      {t(getVoucherStatusLabelKey(status))}
    </Badge>
  );
}

/** What a voucher is: a discount on the invoices, or a boost of an entitlement. */
export function VoucherTypeBadge({
  className,
  type,
}: {
  className?: string;
  type: VoucherType;
}) {
  const { t } = useTranslation();

  return (
    <Badge className={className} data-type={type} variant="outline">
      {t(getVoucherTypeLabelKey(type))}
    </Badge>
  );
}

/** The state of a redemption, which reads as expired once the window of a boost has closed. */
export function RedemptionStatusBadge({
  className,
  now,
  redemption,
}: {
  className?: string;
  now?: number;
  redemption: Parameters<typeof getRedemptionStatus>[0];
}) {
  const { t } = useTranslation();
  const status = getRedemptionStatus(redemption, now);
  const tone = REDEMPTION_TONES[status];

  return (
    <Badge
      className={cn(tone.className, className)}
      data-status={status}
      variant={tone.variant}
    >
      {t(getRedemptionStatusLabelKey(status))}
    </Badge>
  );
}
