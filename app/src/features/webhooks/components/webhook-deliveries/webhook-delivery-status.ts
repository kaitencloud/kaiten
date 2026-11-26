import type { TFunction } from 'i18next';
import { CheckCircle2, type LucideIcon, RotateCw, XCircle } from 'lucide-react';
import type { BadgeProps } from '@/components/ui/badge';
import type { WebhookDeliveryTone } from '../../types';

export interface DeliveryStatusPresentation {
  badgeVariant: BadgeProps['variant'];
  badgeClassName?: string;
  /** A strip bar or a chronology dot. */
  markClassName: string;
  /** The outcome line beside a dot. */
  textClassName: string;
  icon?: LucideIcon;
}

/**
 * How each delivery state is drawn, everywhere: badges, the table's strip and
 * the chronology. Retrying (failed, a retry scheduled) is amber, apart from the
 * grey of a message not attempted yet or being sent.
 *
 * A mark needs 3:1 against the card in both themes. The grey is
 * `muted-foreground` at 70%: about 3.65:1 on the light card (#525252 over
 * #ffffff) and 3.68:1 on the dark one (#a0a0a0 over #222327). At 40% it was
 * under 2.2:1, and still 2.9:1 at 60% in the light theme.
 */
const PENDING_MARK_CLASS_NAME = 'bg-muted-foreground/70';

export const DELIVERY_STATUS_PRESENTATION: Record<
  WebhookDeliveryTone,
  DeliveryStatusPresentation
> = {
  success: {
    badgeVariant: 'success',
    markClassName: 'bg-success',
    textClassName: 'text-muted-foreground',
    icon: CheckCircle2,
  },
  fail: {
    badgeVariant: 'destructive',
    markClassName: 'bg-destructive',
    textClassName: 'text-destructive-subtle-foreground',
    icon: XCircle,
  },
  retrying: {
    badgeVariant: 'secondary',
    badgeClassName:
      'border-transparent bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle',
    markClassName: 'bg-warning',
    textClassName: 'text-warning-subtle-foreground',
    icon: RotateCw,
  },
  pending: {
    badgeVariant: 'outline',
    markClassName: PENDING_MARK_CLASS_NAME,
    textClassName: 'text-muted-foreground',
  },
  sending: {
    badgeVariant: 'outline',
    markClassName: `${PENDING_MARK_CLASS_NAME} animate-pulse`,
    textClassName: 'text-muted-foreground',
  },
};

export function getDeliveryStatusLabel(
  tone: WebhookDeliveryTone,
  t: TFunction,
): string {
  return t(`Pages.Integrations.Webhooks.History.Status.${tone}`);
}
