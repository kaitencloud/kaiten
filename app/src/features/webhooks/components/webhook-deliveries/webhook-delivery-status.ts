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
 */
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
    markClassName: 'bg-muted-foreground/40',
    textClassName: 'text-muted-foreground',
  },
  sending: {
    badgeVariant: 'outline',
    markClassName: 'bg-muted-foreground/40 animate-pulse',
    textClassName: 'text-muted-foreground',
  },
};

export function getDeliveryStatusLabel(
  tone: WebhookDeliveryTone,
  t: TFunction,
): string {
  return t(`Pages.Integrations.Webhooks.History.Status.${tone}`);
}
