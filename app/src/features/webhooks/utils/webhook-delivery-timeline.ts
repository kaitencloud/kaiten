import type { WebhookDelivery } from '../types';
import { parseTimestamp } from './webhook-deliveries';

/**
 * saas-api applies the Slack or Google Chat formatting right after a create,
 * which may touch the webhook's update time: an update this close to the
 * creation is not one a person made.
 */
const UPDATE_TOLERANCE_MS = 60_000;

export interface WebhookMilestone {
  kind: 'created' | 'updated';
  at: string;
}

/**
 * The webhook's own dates, newest first: updated (when it was edited after its
 * creation), then created. A date that does not parse is left out rather than
 * shown as a dash.
 */
export function getWebhookMilestones(
  createdAt?: string,
  updatedAt?: string,
): WebhookMilestone[] {
  const created = parseTimestamp(createdAt);
  const updated = parseTimestamp(updatedAt);
  if (created === undefined || !createdAt) {
    return [];
  }
  const milestones: WebhookMilestone[] = [];
  if (
    updated !== undefined &&
    updatedAt &&
    updated - created > UPDATE_TOLERANCE_MS
  ) {
    milestones.push({ kind: 'updated', at: updatedAt });
  }
  milestones.push({ kind: 'created', at: createdAt });

  return milestones;
}

export type ChronologyItem =
  | { kind: 'delivery'; delivery: WebhookDelivery }
  | { kind: 'milestone'; milestone: WebhookMilestone }
  | { kind: 'older' };

function isNewerThan(milestone: WebhookMilestone, time: number | undefined) {
  const at = parseTimestamp(milestone.at);
  return at !== undefined && time !== undefined && at > time;
}

/**
 * The timeline, newest first: each milestone goes before the first delivery
 * older than it, so an edit made between two deliveries sits between them.
 * When the list holds only the most recent deliveries (`hasMore`), a line says
 * older ones are not shown, and the milestones older than the oldest listed
 * delivery are left out, as they would claim no delivery came before them.
 */
export function buildChronologyItems(
  deliveries: WebhookDelivery[],
  milestones: WebhookMilestone[],
  hasMore: boolean,
): ChronologyItem[] {
  const items: ChronologyItem[] = [];
  let next = 0;
  for (const delivery of deliveries) {
    const time = parseTimestamp(delivery.timestamp);
    while (next < milestones.length && isNewerThan(milestones[next], time)) {
      items.push({ kind: 'milestone', milestone: milestones[next] });
      next += 1;
    }
    items.push({ kind: 'delivery', delivery });
  }
  if (hasMore) {
    return [...items, { kind: 'older' }];
  }
  for (const milestone of milestones.slice(next)) {
    items.push({ kind: 'milestone', milestone });
  }

  return items;
}
