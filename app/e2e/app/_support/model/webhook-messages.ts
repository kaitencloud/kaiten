import { z } from 'zod';
import { BillingProblem } from './billing-problem';

// What saas-api's message routes answer, over Svix's messages and attempts:
// the list of one webhook's messages, one message with its payload and
// attempts, a resend, and the history derived from the same attempts. Local
// types on purpose, like the rest of the webhooks model: a model that imported
// the console's own types could not catch their bugs.

export type MockedDeliveryStatus = 'success' | 'pending' | 'fail' | 'sending';

/** One attempt of Svix to deliver a message to a webhook. */
export type MockedAttempt = {
  id: string;
  timestamp: string;
  status: MockedDeliveryStatus;
  /** Absent when the endpoint did not answer (a timeout, a refused connection). */
  responseStatusCode?: number;
  /** The body the endpoint answered with. */
  response?: string;
  responseDurationMs?: number;
  triggerType: 'scheduled' | 'manual';
};

/** One message published to one webhook, with the attempts Svix made. */
export type MockedMessage = {
  hookId: string;
  messageId: string;
  eventId?: string;
  /** Empty when Svix no longer has the message: the console says "Unknown event". */
  eventType: string;
  timestamp: string;
  /**
   * The message's own status; the newest attempt's when left out. A message
   * that failed and waits for a retry is `pending` with `nextAttempt`.
   */
  status?: MockedDeliveryStatus;
  nextAttempt?: string;
  /** Null once Svix no longer keeps the payload. */
  payload: Record<string, unknown> | null;
  chatService?: 'Slack' | 'Google Chat';
  /** In any order: the routes sort them, newest first, as saas-api does. */
  attempts: MockedAttempt[];
  /** saas-api could not prove it saw every attempt: the list leaves out the count and the last one. */
  attemptsIncomplete?: boolean;
};

/** A resend waiting to settle: it stays `sending` until the message is read twice. */
export type SettlingResend = {
  hookId: string;
  messageId: string;
  attemptId: string;
  outcome: 'success' | 'fail';
  reads: number;
};

const attemptSchema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  status: z.enum(['success', 'pending', 'fail', 'sending']),
  responseStatusCode: z.number().int().positive().optional(),
  response: z.string().optional(),
  responseDurationMs: z.number().int().positive().optional(),
  triggerType: z.enum(['scheduled', 'manual']),
});

const messageSchema = z.object({
  hookId: z.string().min(1),
  // saas-api validates the `msg_` prefix (subscriptions/schema ValidMessageID).
  messageId: z.string().regex(/^msg_[A-Za-z0-9_]+$/),
  eventId: z.string().optional(),
  eventType: z.string(),
  timestamp: z.iso.datetime(),
  status: z.enum(['success', 'pending', 'fail', 'sending']).optional(),
  nextAttempt: z.iso.datetime().optional(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  chatService: z.enum(['Slack', 'Google Chat']).optional(),
  attempts: z.array(attemptSchema),
  attemptsIncomplete: z.boolean().optional(),
});

/**
 * Checks a seed as Svix would hold it: valid ids and dates, one message per
 * webhook and id, attempt ids unique, and no two attempts of a message at the
 * same instant (the console orders them by time).
 */
export function checkMessagesSeed(
  messages: readonly MockedMessage[],
  webhookIds: ReadonlySet<string>,
) {
  const keys = new Set<string>();
  const attemptIds = new Set<string>();
  for (const message of messages) {
    messageSchema.parse(message);
    if (!webhookIds.has(message.hookId)) {
      throw new Error(
        `WebhooksAppModel: message ${message.messageId} names no webhook (${message.hookId})`,
      );
    }
    const key = `${message.hookId}:${message.messageId}`;
    if (keys.has(key)) {
      throw new Error(`WebhooksAppModel: duplicate message ${key}`);
    }
    keys.add(key);
    const times = new Set<string>();
    for (const attempt of message.attempts) {
      if (attemptIds.has(attempt.id)) {
        throw new Error(`WebhooksAppModel: duplicate attempt id ${attempt.id}`);
      }
      attemptIds.add(attempt.id);
      if (times.has(attempt.timestamp)) {
        throw new Error(
          `WebhooksAppModel: two attempts of ${message.messageId} at ${attempt.timestamp}`,
        );
      }
      times.add(attempt.timestamp);
    }
  }
}

const byTimeNewestFirst = <T extends { timestamp: string }>(
  left: T,
  right: T,
) => Date.parse(right.timestamp) - Date.parse(left.timestamp);

export const newestFirst = <T extends { timestamp: string }>(
  items: readonly T[],
): T[] => [...items].sort(byTimeNewestFirst);

/** The message's own status: as seeded, or its newest attempt's. */
export function messageStatus(message: MockedMessage): MockedDeliveryStatus {
  return (
    message.status ?? newestFirst(message.attempts)[0]?.status ?? 'pending'
  );
}

/** An attempt as a list's `lastAttempt` carries it: without the response body. */
function lastAttemptOf(message: MockedMessage) {
  const latest = newestFirst(message.attempts)[0];
  if (!latest) return undefined;
  const copy: Partial<MockedAttempt> = structuredClone(latest);
  delete copy.response;

  return copy;
}

/** One entry of `GET /webhooks/{id}/messages`. */
export function summarizeMessage(
  message: MockedMessage,
  withAttempts: boolean,
) {
  const lastAttempt =
    withAttempts && !message.attemptsIncomplete
      ? lastAttemptOf(message)
      : undefined;

  return {
    messageId: message.messageId,
    ...(message.eventId ? { eventId: message.eventId } : {}),
    eventType: message.eventType,
    timestamp: message.timestamp,
    status: messageStatus(message),
    ...(message.nextAttempt ? { nextAttempt: message.nextAttempt } : {}),
    ...(lastAttempt
      ? { attemptCount: message.attempts.length, lastAttempt }
      : {}),
  };
}

/** The counts over the messages a list returned; `pending` includes `sending`. */
export function countMessages(messages: readonly MockedMessage[]) {
  const statuses = messages.map(messageStatus);
  const count = (...wanted: MockedDeliveryStatus[]) =>
    statuses.filter((status) => wanted.includes(status)).length;

  return {
    total: messages.length,
    delivered: count('success'),
    failed: count('fail'),
    pending: count('pending', 'sending'),
  };
}

/** saas-api's parse of `limit` (1..100, 50 when absent) and `withAttempts`. */
export function parseListQuery(
  limit: string | null,
  withAttempts: string | null,
) {
  const parsedLimit = limit === null ? 50 : Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new BillingProblem(
      400,
      'GetWebhookMessages.InvalidLimit',
      'limit must be an integer between 1 and 100',
    );
  }
  if (
    withAttempts !== null &&
    withAttempts !== 'true' &&
    withAttempts !== 'false'
  ) {
    throw new BillingProblem(
      400,
      'GetWebhookMessages.InvalidWithAttempts',
      'withAttempts must be true or false',
    );
  }

  return { limit: parsedLimit, withAttempts: withAttempts !== 'false' };
}

const MESSAGE_ID = /^msg_[A-Za-z0-9_]+$/;

/**
 * Finds the message a detail or a resend names, refused as saas-api's
 * `messagelookup` refuses it: an id that is not a message id, an unknown
 * message, or one that was never delivered to this webhook.
 */
export function locateMessage(
  messages: readonly MockedMessage[],
  hookId: string,
  messageId: string,
  operation: 'GetWebhookMessage' | 'ResendWebhookMessage',
): MockedMessage {
  if (!MESSAGE_ID.test(messageId)) {
    throw new BillingProblem(
      400,
      `${operation}.InvalidMessageID`,
      'messageId must be a message id',
    );
  }
  const found = messages.find(
    (message) => message.hookId === hookId && message.messageId === messageId,
  );
  if (found) {
    return found;
  }
  const elsewhere = messages.some((message) => message.messageId === messageId);
  throw new BillingProblem(
    404,
    elsewhere ? `${operation}.NotDelivered` : `${operation}.MessageNotFound`,
    elsewhere
      ? 'the message was not delivered to this webhook'
      : 'the message does not exist',
  );
}

/** One message as `GET /webhooks/{id}/messages/{messageId}` answers it. */
export function messageDetail(message: MockedMessage) {
  return {
    messageId: message.messageId,
    ...(message.eventId ? { eventId: message.eventId } : {}),
    ...(message.eventType ? { eventType: message.eventType } : {}),
    timestamp: message.timestamp,
    payloadAvailable: message.payload !== null,
    payload: structuredClone(message.payload),
    ...(message.chatService ? { chatService: message.chatService } : {}),
    attempts: newestFirst(message.attempts).map((attempt) =>
      structuredClone(attempt),
    ),
  };
}

/** The answer a settled resend gets from the endpoint. */
const SETTLED: Record<SettlingResend['outcome'], Partial<MockedAttempt>> = {
  success: { responseStatusCode: 200, response: 'ok', responseDurationMs: 92 },
  fail: {
    responseStatusCode: 503,
    response: 'Service unavailable',
    responseDurationMs: 1_840,
  },
};

/** The resend's attempt takes its outcome, and the message its status. */
export function settle(message: MockedMessage, resend: SettlingResend) {
  const attempt = message.attempts.find((item) => item.id === resend.attemptId);
  if (!attempt) return;
  Object.assign(attempt, { status: resend.outcome }, SETTLED[resend.outcome]);
  message.status = resend.outcome;
  delete message.nextAttempt;
}

/** Later than every time the store holds: a resend is always the newest attempt. */
export function nextResendTime(messages: readonly MockedMessage[]): string {
  const times = messages.flatMap((message) => [
    Date.parse(message.timestamp),
    ...message.attempts.map((attempt) => Date.parse(attempt.timestamp)),
  ]);
  const latest =
    times.length > 0 ? Math.max(...times) : Date.parse('2026-11-26T12:00:00Z');

  return new Date(latest + 60_000).toISOString();
}

/** One entry of `GET /webhooks/history`: one attempt of one message. */
export function historyEntry(
  message: MockedMessage,
  attempt: MockedAttempt,
  hookUrl: string,
  legacy: boolean,
) {
  return {
    date: attempt.timestamp,
    hookId: message.hookId,
    hookUrl,
    eventType: message.eventType,
    status: attempt.status,
    ...(attempt.responseStatusCode
      ? { responseStatusCode: attempt.responseStatusCode }
      : {}),
    ...(attempt.response ? { responseStatusText: attempt.response } : {}),
    ...(legacy
      ? {}
      : {
          messageId: message.messageId,
          attemptId: attempt.id,
          ...(attempt.responseDurationMs
            ? { responseDurationMs: attempt.responseDurationMs }
            : {}),
          triggerType: attempt.triggerType,
        }),
  };
}
