import type { WebhookDelivery, WebhookMessageCounts } from '../types';
import { getDeliveryTone, parseTimestamp } from './webhook-deliveries';

/**
 * A webhook's recent deliveries counted by state. saas-api's summary counts a
 * message that waits for a retry as pending; it is told apart here as
 * retrying, so `inFlight` is what remains: not attempted yet, or being sent.
 */
export interface RecentDeliveriesCounts {
  total: number;
  delivered: number;
  failed: number;
  retrying: number;
  inFlight: number;
}

export function countRecentDeliveries(
  deliveries: readonly WebhookDelivery[],
  summary: WebhookMessageCounts,
): RecentDeliveriesCounts {
  const retrying = deliveries.filter(
    (delivery) => getDeliveryTone(delivery) === 'retrying',
  ).length;

  return {
    total: summary.total,
    delivered: summary.delivered,
    failed: summary.failed,
    retrying,
    inFlight: Math.max(0, summary.pending - retrying),
  };
}

/** The word the table's cell ends on: the worst state among the recent deliveries. */
export type RecentDeliveriesOutcome =
  | { kind: 'failures' | 'retrying' | 'inFlight'; count: number }
  | { kind: 'allDelivered' };

export function getRecentDeliveriesOutcome(
  counts: RecentDeliveriesCounts,
): RecentDeliveriesOutcome {
  if (counts.failed > 0) return { kind: 'failures', count: counts.failed };
  if (counts.retrying > 0) return { kind: 'retrying', count: counts.retrying };
  if (counts.inFlight > 0) return { kind: 'inFlight', count: counts.inFlight };
  return { kind: 'allDelivered' };
}

/** When the newest delivery was published; undefined when no time parses. */
export function getLastDeliveryAt(
  deliveries: readonly WebhookDelivery[],
): string | undefined {
  let latest: { at: number; value: string } | undefined;
  for (const delivery of deliveries) {
    const at = parseTimestamp(delivery.timestamp);
    if (at !== undefined && (latest === undefined || at > latest.at)) {
      latest = { at, value: delivery.timestamp };
    }
  }

  return latest?.value;
}

/**
 * Newest first by publication time, whatever order the API sent: a resend adds
 * an attempt, not a message, so a delivery never moves while it is read. A
 * time that does not parse sorts last.
 */
export function sortDeliveriesNewestFirst(
  deliveries: readonly WebhookDelivery[],
): WebhookDelivery[] {
  return deliveries
    .map((delivery, index) => ({
      delivery,
      index,
      at: parseTimestamp(delivery.timestamp),
    }))
    .sort((left, right) => {
      if (left.at !== right.at) {
        if (left.at === undefined) return 1;
        if (right.at === undefined) return -1;
        return right.at - left.at;
      }
      return left.index - right.index;
    })
    .map(({ delivery }) => delivery);
}
