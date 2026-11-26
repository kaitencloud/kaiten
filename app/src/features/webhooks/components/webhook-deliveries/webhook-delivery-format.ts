import type { TFunction } from 'i18next';
import { formatDateTime, formatNumber } from '@/lib/format-date';
import type { WebhookDeliveryTrigger } from '../../types';

/** Deliveries and their retries often share a minute: times show seconds. */
export const formatDeliveryTime = (value: string | undefined) =>
  formatDateTime(value, { dateStyle: 'medium', timeStyle: 'medium' });

export const formatDeliveryDuration = (ms: number, t: TFunction) =>
  t('Pages.Integrations.Webhooks.Deliveries.Outcome.duration', {
    value: formatNumber(ms),
  });

const TRIGGERS: readonly WebhookDeliveryTrigger[] = ['scheduled', 'manual'];

/** A trigger in words; one this build does not know reads as itself. */
export function formatDeliveryTrigger(
  trigger: string | undefined,
  t: TFunction,
): string {
  const known = TRIGGERS.find((value) => value === trigger);
  if (known) {
    return t(`Pages.Integrations.Webhooks.Deliveries.Trigger.${known}`);
  }

  return trigger || '—';
}
