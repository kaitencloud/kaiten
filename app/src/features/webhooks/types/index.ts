// Types for webhooks feature
//
// A subscription names its events by type, as the API publishes them
// (com.kaiten.license.v1.created); utils/webhook-events maps each type to the
// event's name, label and group.

export type WebhookDeliveryStatus = 'success' | 'pending' | 'fail' | 'sending';

export interface Webhook {
  id: string;
  eventTypes: string[];
  url: string;
  signingSecret?: string;
  createdAt: string;
}

export interface ApiWebhook {
  id: string;
  eventTypes: string[];
  url: string;
  signingSecret?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** The body of a create (POST) and of an update (PUT): the two members it replaces. */
export interface WebhookInput {
  eventTypes: string[];
  url: string;
}

/** Whether Svix scheduled an attempt (the first one, or a retry) or a person resent it. */
export type WebhookDeliveryTrigger = 'scheduled' | 'manual';

/**
 * One attempt of the history (`GET /webhooks/history`). The four last fields
 * are absent when saas-api predates them: the console and saas-api deploy on
 * their own schedules.
 */
export interface WebhookHistoryEntry {
  date: string;
  hookId: string;
  hookUrl: string;
  /** Empty when the delivery's message could not be looked up. */
  eventType: string;
  status: WebhookDeliveryStatus;
  responseStatusCode?: number;
  /** The body the endpoint answered with, despite its name. */
  responseStatusText?: string;
  /** The Svix message id (`msg_...`) the attempt delivered. */
  messageId?: string;
  attemptId?: string;
  responseDurationMs?: number;
  triggerType?: WebhookDeliveryTrigger;
}

export interface WebhookHistoryResponse {
  history: WebhookHistoryEntry[];
}

/**
 * One attempt to deliver a message to a webhook. `responseStatusCode` and
 * `responseDurationMs` are absent when the endpoint did not answer (a timeout,
 * a refused connection), and `response` is absent from a list's `lastAttempt`.
 */
export interface WebhookMessageAttempt {
  id: string;
  timestamp: string;
  status: WebhookDeliveryStatus;
  responseStatusCode?: number;
  /** The body the endpoint answered with. */
  response?: string;
  responseDurationMs?: number;
  triggerType?: WebhookDeliveryTrigger;
}

/**
 * One message of a webhook, as `GET /webhooks/{id}/messages` lists it. `status`
 * is the message's own: a message that failed and waits for a retry is
 * `pending` with `nextAttempt`. `attemptCount` and `lastAttempt` are absent
 * when the list was asked without attempts, or could not prove it saw them all.
 */
export interface WebhookMessageSummary {
  messageId: string;
  eventId?: string;
  eventType: string;
  timestamp: string;
  status: WebhookDeliveryStatus;
  nextAttempt?: string;
  attemptCount?: number;
  lastAttempt?: WebhookMessageAttempt;
}

/** Counts over the messages a list returned; `pending` includes `sending`. */
export interface WebhookMessageCounts {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
}

/** `GET /webhooks/{id}/messages`: the most recent messages, newest first. */
export interface WebhookMessageList {
  webhook: { id: string; url: string; createdAt: string; updatedAt: string };
  messages: WebhookMessageSummary[];
  summary: WebhookMessageCounts;
  hasMore: boolean;
}

/** The chat service whose message an endpoint received instead of the event. */
export type WebhookMessageChatService = 'Slack' | 'Google Chat';

/**
 * `GET /webhooks/{id}/messages/{messageId}`: one message with its payload and
 * the webhook's attempts at it. `payload` is null, and `payloadAvailable`
 * false, once the delivery provider no longer keeps the payload; the event
 * fields are then absent too if the message itself is gone.
 */
export interface WebhookMessage {
  messageId: string;
  eventId?: string;
  eventType?: string;
  timestamp?: string;
  payloadAvailable?: boolean;
  payload: Record<string, unknown> | null;
  /** Set for a Slack or Google Chat endpoint, which received a message built from `payload`. */
  chatService?: WebhookMessageChatService;
  /** Newest first as sent; the console sorts them itself. */
  attempts: WebhookMessageAttempt[];
}

/** `POST /webhooks/{id}/messages/{messageId}/resend`: the attempt is queued. */
export interface WebhookMessageResendResponse {
  messageId: string;
  webhookId: string;
}

/**
 * A message's state as the deliveries screens draw it: its status, with a
 * pending message that failed and waits for a retry told apart as retrying.
 */
export type WebhookDeliveryTone = WebhookDeliveryStatus | 'retrying';

/**
 * One delivery as the deliveries screens show it: one message to one webhook.
 * It comes either from the webhook's message list, whose status is the
 * message's own, or from one attempt of the history, whose status is that
 * attempt's and gives way to the newest attempt the message shows.
 */
export interface WebhookDelivery {
  /** `${hookId}:${messageId}`, or `${hookId}:no-message:${date}:${status}` without a message id. */
  key: string;
  hookId: string;
  /** Absent from an attempt of a saas-api that predates message ids. */
  messageId?: string;
  /** Empty when the delivery provider no longer has the message. */
  eventType: string;
  /** When the message was created, or when the history's attempt was made. */
  timestamp: string;
  status: WebhookDeliveryStatus;
  statusSource: 'message' | 'attempt';
  nextAttempt?: string;
  /** Absent when not known (a list without attempts, or a history attempt). */
  attemptCount?: number;
  /** The attempts known before the message is read: none, or one. */
  attempts: WebhookMessageAttempt[];
}
