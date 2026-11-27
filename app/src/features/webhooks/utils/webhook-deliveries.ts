import type { TFunction } from 'i18next';
import { formatDateTime, formatNumber } from '@/lib/format-date';
import type {
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookDeliveryTone,
  WebhookHistoryEntry,
  WebhookMessage,
  WebhookMessageAttempt,
  WebhookMessageSummary,
} from '../types';

const DELIVERY_STATUSES: readonly WebhookDeliveryStatus[] = [
  'success',
  'pending',
  'fail',
  'sending',
];

const OUTCOME_KEY = 'Pages.Integrations.Webhooks.Deliveries.Outcome';

/** Joins the parts of an outcome line: a typographic separator, not a word. */
export const OUTCOME_SEPARATOR = ' · ';

/**
 * A status this build knows. Anything else reads as pending, as saas-api maps
 * a Svix status it does not know, so that a value the API adds later can
 * never index a missing presentation.
 */
export function normalizeDeliveryStatus(
  status: string | undefined,
): WebhookDeliveryStatus {
  return DELIVERY_STATUSES.find((known) => known === status) ?? 'pending';
}

/** A pending message with a next attempt has failed and waits for a retry. */
export function getDeliveryTone({
  status,
  nextAttempt,
}: {
  status: string;
  nextAttempt?: string;
}): WebhookDeliveryTone {
  const normalized = normalizeDeliveryStatus(status);
  return normalized === 'pending' && nextAttempt ? 'retrying' : normalized;
}

/** saas-api drops a zero code: 0 and absent both mean "no HTTP answer". */
export function hasResponseCode(code: number | undefined): code is number {
  return code != null && code > 0;
}

/** Milliseconds since the epoch, or undefined for a missing or unreadable value. */
export function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);

  return Number.isNaN(time) ? undefined : time;
}

function normalizeAttempt(
  attempt: WebhookMessageAttempt,
): WebhookMessageAttempt {
  return { ...attempt, status: normalizeDeliveryStatus(attempt.status) };
}

/** Oldest first; a time that does not parse sorts last; ties by id. */
function compareAttempts(
  left: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>,
  right: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>,
): number {
  const leftTime = parseTimestamp(left.timestamp);
  const rightTime = parseTimestamp(right.timestamp);

  if (leftTime !== rightTime) {
    if (leftTime === undefined) return 1;
    if (rightTime === undefined) return -1;
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

/** Whether `attempt` comes after `than`, in the order the detail lists them. */
export function isLaterAttempt(
  attempt: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>,
  than: Pick<WebhookMessageAttempt, 'id' | 'timestamp'>,
): boolean {
  return compareAttempts(than, attempt) < 0;
}

/** A message of the webhook's list, as a delivery. */
export function mapMessageSummaryToDelivery(
  message: WebhookMessageSummary,
  webhookId: string,
): WebhookDelivery {
  return {
    key: `${webhookId}:${message.messageId}`,
    hookId: webhookId,
    messageId: message.messageId,
    eventType: message.eventType ?? '',
    timestamp: message.timestamp,
    status: normalizeDeliveryStatus(message.status),
    statusSource: 'message',
    nextAttempt: message.nextAttempt,
    attemptCount: message.attemptCount,
    attempts: message.lastAttempt
      ? [normalizeAttempt(message.lastAttempt)]
      : [],
  };
}

/**
 * The id the history's attempt has among the message's attempts. A saas-api
 * that predates attempt ids sends no message id either, so no message is read
 * and the date stands in for the id on both sides.
 */
export function getHistoryEntryAttemptId(entry: WebhookHistoryEntry): string {
  return entry.attemptId ?? entry.date;
}

function historyEntryToAttempt(
  entry: WebhookHistoryEntry,
): WebhookMessageAttempt {
  return {
    id: getHistoryEntryAttemptId(entry),
    timestamp: entry.date,
    status: normalizeDeliveryStatus(entry.status),
    responseStatusCode: entry.responseStatusCode,
    response: entry.responseStatusText,
    responseDurationMs: entry.responseDurationMs,
    triggerType: entry.triggerType,
  };
}

/** One attempt of the history, as the delivery of its message. */
export function deliveryFromHistoryEntry(
  entry: WebhookHistoryEntry,
): WebhookDelivery {
  const status = normalizeDeliveryStatus(entry.status);
  const messageId = entry.messageId || undefined;

  return {
    key: messageId
      ? `${entry.hookId}:${messageId}`
      : `${entry.hookId}:no-message:${entry.date}:${status}`,
    hookId: entry.hookId,
    messageId,
    eventType: entry.eventType ?? '',
    timestamp: entry.date,
    status,
    statusSource: 'attempt',
    attempts: [historyEntryToAttempt(entry)],
  };
}

/**
 * The attempts to show, oldest first: the message's own once it is read, else
 * what the delivery came with. The API's order is never relied on.
 */
export function resolveAttempts(
  delivery: WebhookDelivery,
  message?: Pick<WebhookMessage, 'attempts'>,
): WebhookMessageAttempt[] {
  return (message?.attempts ?? delivery.attempts)
    .map(normalizeAttempt)
    .sort(compareAttempts);
}

/**
 * Whether the message read knows more than the list did: an attempt newer than
 * the list's last one (a resend the list has not caught up with), or that same
 * attempt in another state (the list caught it sending, the read after it
 * settled).
 */
function isAheadOfList(
  latest: WebhookMessageAttempt | undefined,
  known: WebhookMessageAttempt | undefined,
): boolean {
  if (latest === undefined || known === undefined) {
    return false;
  }
  if (latest.id === known.id) {
    return latest.status !== known.status;
  }

  return compareAttempts(known, latest) < 0;
}

/**
 * The delivery's state against its attempts. A history attempt gives way to
 * the newest attempt; the list's message status holds, retrying included,
 * unless the message read is ahead of the list (see `isAheadOfList`): its
 * newest attempt then gives the status, without the list's next attempt.
 */
export function resolveDeliveryState(
  delivery: WebhookDelivery,
  attempts: WebhookMessageAttempt[],
): { status: WebhookDeliveryStatus; nextAttempt?: string } {
  const latest = attempts.at(-1);
  const known = delivery.attempts.at(-1);

  if (delivery.statusSource === 'message' && !isAheadOfList(latest, known)) {
    return { status: delivery.status, nextAttempt: delivery.nextAttempt };
  }

  return { status: normalizeDeliveryStatus(latest?.status ?? delivery.status) };
}

function statusLabel(tone: WebhookDeliveryTone, t: TFunction): string {
  return t(`Pages.Integrations.Webhooks.History.Status.${tone}`);
}

function describeRetrying(delivery: WebhookDelivery, t: TFunction): string[] {
  const count = delivery.attemptCount ?? 0;
  const parts = [
    count > 0
      ? t(`${OUTCOME_KEY}.retrying`, { count })
      : statusLabel('retrying', t),
  ];
  if (parseTimestamp(delivery.nextAttempt) !== undefined) {
    parts.push(
      t(`${OUTCOME_KEY}.nextAttempt`, {
        when: formatDateTime(delivery.nextAttempt),
      }),
    );
  }

  return parts;
}

/**
 * The outcome line of a delivery, as parts to join with OUTCOME_SEPARATOR:
 * "200 · 84 ms", "503 · 3 attempts", "No response", "Pending · attempt 1".
 * Without a known attempt it falls back to the status word.
 */
export function describeDeliveryOutcome(
  delivery: WebhookDelivery,
  t: TFunction,
): string[] {
  const tone = getDeliveryTone(delivery);
  const count = delivery.attemptCount ?? 0;

  if (tone === 'retrying') {
    return describeRetrying(delivery, t);
  }
  if (tone === 'pending' || tone === 'sending') {
    return [
      count > 0 ? t(`${OUTCOME_KEY}.${tone}`, { count }) : statusLabel(tone, t),
    ];
  }

  const latest = resolveAttempts(delivery).at(-1);
  const attemptsPart =
    count > 1 ? t(`${OUTCOME_KEY}.attempts`, { count }) : undefined;

  if (!latest) {
    return [statusLabel(tone, t), attemptsPart].filter(isPart);
  }

  const code = latest.responseStatusCode;
  const duration = latest.responseDurationMs ?? 0;
  const codePart = hasResponseCode(code)
    ? String(code)
    : tone === 'fail'
      ? t(`${OUTCOME_KEY}.noResponse`)
      : statusLabel(tone, t);
  // A failure retried several times reads by its count, not by the time of
  // its last attempt.
  const durationPart =
    duration > 0 && !(tone === 'fail' && count > 1)
      ? t(`${OUTCOME_KEY}.duration`, { value: formatNumber(duration) })
      : undefined;

  return [codePart, durationPart, attemptsPart].filter(isPart);
}

function isPart(part: string | undefined): part is string {
  return part !== undefined;
}

/**
 * The share of deliveries delivered, in whole percent, rounded down and never
 * 100 while one is not delivered: 199 of 200 reads 99. Null with none.
 */
export function formatDeliveryRate({
  delivered,
  total,
}: {
  delivered: number;
  total: number;
}): { percent: number } | null {
  if (total <= 0) {
    return null;
  }
  if (delivered >= total) {
    return { percent: 100 };
  }

  return { percent: Math.min(99, Math.floor((delivered / total) * 100)) };
}
