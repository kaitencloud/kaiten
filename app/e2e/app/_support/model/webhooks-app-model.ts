import { type ArmedBillingProblem, ArmedProblems } from './armed-problems';
import { BillingProblem } from './billing-problem';
import {
  checkMessagesSeed,
  countMessages,
  historyEntry,
  locateMessage,
  type MockedMessage,
  messageDetail,
  newestFirst,
  nextResendTime,
  parseListQuery,
  type SettlingResend,
  settle,
  summarizeMessage,
} from './webhook-messages';

export type {
  MockedAttempt,
  MockedDeliveryStatus,
  MockedMessage,
} from './webhook-messages';

/**
 * One outbound webhook as saas-api keeps it in Svix: a URL, the event types its
 * filter names, and its signing secret. Local to the model on purpose: a model
 * that imported the console's own types or schema could not catch their bugs.
 * `eventTypes` is `null` for an endpoint created without a filter (outside the
 * console), as saas-api passes Svix's nil `FilterTypes` through.
 */
export type MockedWebhook = {
  id: string;
  url: string;
  eventTypes: string[] | null;
  signingSecret: string;
  createdAt: string;
  updatedAt: string;
};

/** A webhook a scenario seeds: the secret and the dates are filled in when absent. */
export type MockedWebhookSeed = Pick<
  MockedWebhook,
  'id' | 'url' | 'eventTypes'
> &
  Partial<Pick<MockedWebhook, 'signingSecret' | 'createdAt' | 'updatedAt'>>;

/** The body of `POST /webhooks` and `PUT /webhooks/{id}`. */
export type WebhookBody = { url: string; eventTypes: string[] };

/** The operations a spec can arm a refusal for. */
export type WebhookOperation =
  | 'createWebhook'
  | 'updateWebhook'
  | 'getWebhook'
  | 'listMessages'
  | 'getMessage'
  | 'resend'
  | 'history';

/** A write saas-api accepted, in order: what a spec asserts was sent. */
export type AcceptedWebhookWrite =
  | { operation: 'create'; webhookId: string; body: WebhookBody }
  | { operation: 'update'; webhookId: string; body: WebhookBody }
  | { operation: 'delete'; webhookId: string }
  | { operation: 'resend'; webhookId: string; messageId: string };

export type WebhookRefusal =
  | 'svixValidation'
  | 'svixNotFound'
  | 'notEntitled'
  | 'missingScope'
  | 'messagesLookupFailed'
  | 'messageLookupFailed'
  | 'historyLookupFailed'
  | 'payloadUnavailable'
  | 'notDelivered'
  | 'resendFailed';

/** saas-api's refusals a spec can arm, with the codes and words the toast shows. */
export const WEBHOOK_REFUSALS: Record<WebhookRefusal, ArmedBillingProblem> = {
  svixValidation: {
    code: 'Svix.ValidationError',
    detail: 'The webhook URL was refused by the delivery provider.',
    status: 422,
  },
  svixNotFound: {
    code: 'Svix.NotFound',
    detail: 'The webhook does not exist.',
    status: 404,
  },
  notEntitled: {
    code: 'Webhooks.NotEntitled',
    detail: "This organization's licence allows no webhook events",
    status: 403,
  },
  missingScope: {
    code: 'RequireScope.MissingScope',
    detail: 'missing required scope: write:webhooks',
    status: 403,
  },
  messagesLookupFailed: {
    code: 'GetWebhookMessages.LookupFailed',
    detail: 'The deliveries of this webhook could not be read.',
    status: 500,
  },
  messageLookupFailed: {
    code: 'GetWebhookMessage.LookupFailed',
    detail: 'The delivery could not be read.',
    status: 500,
  },
  // The history's own code is not one the console reads: only the status.
  historyLookupFailed: {
    code: 'GetWebhookHistory.LookupFailed',
    detail: 'The delivery history could not be read.',
    status: 500,
  },
  payloadUnavailable: {
    code: 'ResendWebhookMessage.PayloadUnavailable',
    detail: 'The payload of this message is no longer available.',
    status: 409,
  },
  notDelivered: {
    code: 'ResendWebhookMessage.NotDelivered',
    detail: 'The message was not delivered to this webhook.',
    status: 404,
  },
  resendFailed: {
    code: 'ResendWebhookMessage.ResendFailed',
    detail: 'The message could not be resent.',
    status: 500,
  },
};

/** saas-api keeps at most this many attempts per webhook in the history. */
const HISTORY_ATTEMPTS_PER_WEBHOOK = 50;

// saas-api's own pattern for an event type (subscriptions/schema/schema.go),
// copied rather than imported: the model stands for the server.
const EVENT_TYPE_PATTERN =
  /^com\.kaiten\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.v[1-9][0-9]*\.[a-z][a-z0-9_]*$/;

// A fixed clock that moves a minute per write: the dates are stable from run to run.
const START = Date.parse('2026-11-20T09:00:00Z');
const MINUTE = 60_000;

export type SerializedWebhooksAppModel = {
  webhooks: MockedWebhook[];
  messages: MockedMessage[];
  settling: SettlingResend[];
  resendOutcome: SettlingResend['outcome'];
  legacyHistory: boolean;
  problems: Array<[WebhookOperation, ArmedBillingProblem]>;
  writes: AcceptedWebhookWrite[];
  sequence: number;
};

export type WebhooksAppModelSeed = {
  webhooks?: MockedWebhookSeed[];
  /** The messages Svix holds for those webhooks; none by default. */
  messages?: MockedMessage[];
  /** History entries without message and attempt ids, as an older saas-api answers. */
  legacyHistory?: boolean;
};

const notFound = () => {
  const { code, detail, status } = WEBHOOK_REFUSALS.svixNotFound;
  return new BillingProblem(status, code, detail);
};

const webhookNotFound = (operation: string) =>
  new BillingProblem(
    404,
    `${operation}.WebhookNotFound`,
    'the webhook does not exist',
  );

/** A webhook as `GET /webhooks` lists it and `PUT` answers it: no secret. */
const withoutSecret = (
  webhook: MockedWebhook,
): Omit<MockedWebhook, 'signingSecret'> => {
  const copy: Partial<MockedWebhook> = structuredClone(webhook);
  delete copy.signingSecret;

  return copy as Omit<MockedWebhook, 'signingSecret'>;
};

function checkSeed(webhooks: readonly MockedWebhookSeed[]) {
  const ids = new Set<string>();
  for (const webhook of webhooks) {
    if (!webhook.id || ids.has(webhook.id)) {
      throw new Error(
        `WebhooksAppModel: duplicate or empty id "${webhook.id}"`,
      );
    }
    ids.add(webhook.id);
    if (!webhook.url) {
      throw new Error(`WebhooksAppModel: webhook ${webhook.id} has no URL`);
    }
    if (webhook.eventTypes !== null && !Array.isArray(webhook.eventTypes)) {
      throw new Error(
        `WebhooksAppModel: webhook ${webhook.id} eventTypes must be an array or null`,
      );
    }
  }
}

/**
 * saas-api's outbound webhooks, `/api/webhooks`: the list, one webhook with its
 * secret, create, update and delete, validated as saas-api validates them, and
 * the refusals a spec arms. `mutateExternally` stands for another tab or an API
 * client changing a webhook while the page is open; push it to the running page
 * with `updateMswMocks(page, 'webhooks', model)`.
 *
 * The deliveries come from one store of messages and their attempts: a
 * webhook's message list, one message, a resend, and the history, one entry
 * per attempt. A resend adds a manual attempt that stays `sending` until the
 * message is read a second time, then settles (`failNextResend` makes it fail).
 */
export class WebhooksAppModel {
  private webhooks: MockedWebhook[];
  private messages: MockedMessage[];
  private settling: SettlingResend[] = [];
  private resendOutcome: SettlingResend['outcome'] = 'success';
  private readonly legacyHistory: boolean;
  private problems = new ArmedProblems<WebhookOperation>();
  private readonly writes: AcceptedWebhookWrite[] = [];
  private sequence = 0;

  constructor({
    webhooks = [],
    messages = [],
    legacyHistory = false,
  }: WebhooksAppModelSeed = {}) {
    checkSeed(webhooks);
    checkMessagesSeed(messages, new Set(webhooks.map((webhook) => webhook.id)));
    this.webhooks = webhooks.map((webhook) => ({
      signingSecret: `whsec_mock_${webhook.id}`,
      createdAt: new Date(START).toISOString(),
      updatedAt: new Date(START).toISOString(),
      ...structuredClone(webhook),
    }));
    this.messages = structuredClone(messages);
    this.legacyHistory = legacyHistory;
  }

  static fromSerialized(state: SerializedWebhooksAppModel): WebhooksAppModel {
    const model = new WebhooksAppModel({
      webhooks: state.webhooks,
      legacyHistory: state.legacyHistory,
    });
    // Saved by the model itself: the seed was checked when it was built, and a
    // webhook deleted since may leave messages behind, as Svix does.
    model.messages = structuredClone(state.messages ?? []);
    model.settling = structuredClone(state.settling ?? []);
    model.resendOutcome = state.resendOutcome ?? 'success';
    model.problems = ArmedProblems.from(state.problems);
    model.writes.push(...structuredClone(state.writes));
    model.sequence = state.sequence;

    return model;
  }

  serializeForMsw(): SerializedWebhooksAppModel {
    return {
      webhooks: structuredClone(this.webhooks),
      messages: structuredClone(this.messages),
      settling: structuredClone(this.settling),
      resendOutcome: this.resendOutcome,
      legacyHistory: this.legacyHistory,
      problems: this.problems.serialize(),
      writes: structuredClone(this.writes),
      sequence: this.sequence,
    };
  }

  /** The next call of `operation` is refused, as saas-api refuses it for `refusal`. */
  refuseNext(
    operation: WebhookOperation,
    refusal: WebhookRefusal | ArmedBillingProblem,
    times = 1,
  ) {
    const problem =
      typeof refusal === 'string' ? WEBHOOK_REFUSALS[refusal] : refusal;
    this.problems.arm(operation, { ...problem, times });
  }

  /** The writes saas-api accepted, in order. */
  get acceptedWrites(): ReadonlyArray<AcceptedWebhookWrite> {
    return this.writes;
  }

  /** `GET /webhooks`: every webhook, newest first, without its secret. */
  listWebhooks() {
    return this.webhooks.map(withoutSecret);
  }

  /** `GET /webhooks/{id}`: one webhook, with its signing secret. */
  getWebhook(webhookId: string): MockedWebhook {
    this.problems.consume('getWebhook');
    const webhook = this.find(webhookId);
    if (!webhook) throw notFound();

    return structuredClone(webhook);
  }

  /** `POST /webhooks`: validated, then created first in the list. */
  createWebhook(body: unknown) {
    const valid = this.validate('CreateWebhook', body);
    this.problems.consume('createWebhook');
    const now = this.tick();
    this.sequence += 1;
    const webhook: MockedWebhook = {
      id: `ep_mock${String(this.sequence).padStart(3, '0')}`,
      url: valid.url,
      eventTypes: [...valid.eventTypes],
      signingSecret: `whsec_mock_${this.sequence}`,
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.unshift(webhook);
    this.writes.push({
      operation: 'create',
      webhookId: webhook.id,
      body: valid,
    });

    return withoutSecret(webhook);
  }

  /** `PUT /webhooks/{id}`: replaces the URL and the events, keeps the secret. */
  updateWebhook(webhookId: string, body: unknown) {
    const valid = this.validate('UpdateWebhook', body);
    this.problems.consume('updateWebhook');
    const webhook = this.find(webhookId);
    if (!webhook) throw notFound();
    webhook.url = valid.url;
    webhook.eventTypes = [...valid.eventTypes];
    webhook.updatedAt = this.tick();
    this.writes.push({ operation: 'update', webhookId, body: valid });

    return withoutSecret(webhook);
  }

  /** `DELETE /webhooks/{id}`. */
  deleteWebhook(webhookId: string) {
    if (!this.find(webhookId)) throw notFound();
    this.webhooks = this.webhooks.filter((webhook) => webhook.id !== webhookId);
    this.writes.push({ operation: 'delete', webhookId });
  }

  /**
   * Another client changes a webhook (`patch`) or deletes it (`null`) without
   * going through the page: not an accepted write of the page.
   */
  mutateExternally(
    webhookId: string,
    patch: Partial<Pick<MockedWebhook, 'url' | 'eventTypes'>> | null,
  ) {
    if (patch === null) {
      this.webhooks = this.webhooks.filter(
        (webhook) => webhook.id !== webhookId,
      );
      return;
    }
    const webhook = this.find(webhookId);
    if (!webhook) throw new Error(`WebhooksAppModel: no webhook ${webhookId}`);
    Object.assign(webhook, structuredClone(patch), { updatedAt: this.tick() });
  }

  /**
   * `GET /webhooks/{id}/messages`: the most recent messages, newest first,
   * without their attempt count and last attempt when `withAttempts` is false.
   */
  listMessages(
    webhookId: string,
    query: { limit: string | null; withAttempts: string | null },
  ) {
    this.problems.consume('listMessages');
    const { limit, withAttempts } = parseListQuery(
      query.limit,
      query.withAttempts,
    );
    const webhook = this.find(webhookId);
    if (!webhook) throw webhookNotFound('GetWebhookMessages');
    const all = newestFirst(this.messagesOf(webhookId));
    const returned = all.slice(0, limit);

    return {
      webhook: {
        id: webhook.id,
        url: webhook.url,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      },
      messages: returned.map((message) =>
        summarizeMessage(message, withAttempts),
      ),
      summary: countMessages(returned),
      hasMore: all.length > limit,
    };
  }

  /**
   * `GET /webhooks/{id}/messages/{messageId}`: one message with its payload
   * and attempts. A resend waiting on this message settles on its second read.
   */
  getMessage(webhookId: string, messageId: string) {
    this.problems.consume('getMessage');
    if (!this.find(webhookId)) throw webhookNotFound('GetWebhookMessage');
    const message = locateMessage(
      this.messages,
      webhookId,
      messageId,
      'GetWebhookMessage',
    );
    this.advanceResends(message);

    return messageDetail(message);
  }

  /** `POST /webhooks/{id}/messages/{messageId}/resend`: queues a manual attempt (202). */
  resend(webhookId: string, messageId: string) {
    this.problems.consume('resend');
    if (!this.find(webhookId)) throw webhookNotFound('ResendWebhookMessage');
    const message = locateMessage(
      this.messages,
      webhookId,
      messageId,
      'ResendWebhookMessage',
    );
    if (message.payload === null) {
      const { code, detail, status } = WEBHOOK_REFUSALS.payloadUnavailable;
      throw new BillingProblem(status, code, detail);
    }
    this.sequence += 1;
    const attemptId = `atmpt_resend_${String(this.sequence).padStart(3, '0')}`;
    message.attempts.push({
      id: attemptId,
      timestamp: nextResendTime(this.messages),
      status: 'sending',
      triggerType: 'manual',
    });
    message.status = 'sending';
    delete message.nextAttempt;
    this.settling.push({
      hookId: webhookId,
      messageId,
      attemptId,
      outcome: this.resendOutcome,
      reads: 0,
    });
    this.resendOutcome = 'success';
    this.writes.push({ operation: 'resend', webhookId, messageId });

    return { messageId, webhookId };
  }

  /** The next resend's attempt fails once it settles (a 503 from the endpoint). */
  failNextResend() {
    this.resendOutcome = 'fail';
  }

  /**
   * `GET /webhooks/history`: one entry per attempt, newest first, at most 50
   * per webhook, from the same messages the other routes read.
   */
  history() {
    this.problems.consume('history');
    const entries = this.webhooks.flatMap((webhook) =>
      newestFirst(
        this.messagesOf(webhook.id).flatMap((message) =>
          message.attempts.map((attempt) => ({
            timestamp: attempt.timestamp,
            entry: historyEntry(
              message,
              attempt,
              webhook.url,
              this.legacyHistory,
            ),
          })),
        ),
      ).slice(0, HISTORY_ATTEMPTS_PER_WEBHOOK),
    );

    return { history: newestFirst(entries).map(({ entry }) => entry) };
  }

  private messagesOf(webhookId: string) {
    return this.messages.filter((message) => message.hookId === webhookId);
  }

  private advanceResends(message: MockedMessage) {
    const waiting = this.settling.filter(
      (resend) =>
        resend.hookId === message.hookId &&
        resend.messageId === message.messageId,
    );
    for (const resend of waiting) {
      resend.reads += 1;
      if (resend.reads >= 2) {
        settle(message, resend);
      }
    }
    this.settling = this.settling.filter((resend) => resend.reads < 2);
  }

  private find(webhookId: string) {
    return this.webhooks.find((webhook) => webhook.id === webhookId);
  }

  private tick() {
    const at = START + (this.writes.length + 1) * MINUTE;
    return new Date(at).toISOString();
  }

  // As saas-api: the URL must be there, the events too, each a valid type. Svix
  // decides the rest of the URL (a 422, armed by a spec when it needs one).
  private validate(
    operation: 'CreateWebhook' | 'UpdateWebhook',
    body: unknown,
  ): WebhookBody {
    const { url, eventTypes } = (body ?? {}) as Partial<
      Record<keyof WebhookBody, unknown>
    >;
    if (typeof url !== 'string' || url.trim() === '') {
      throw new BillingProblem(
        400,
        `${operation}.MissingURL`,
        'url is required',
      );
    }
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      throw new BillingProblem(
        400,
        `${operation}.MissingEventTypes`,
        'eventTypes must name at least one event type',
      );
    }
    const invalid = eventTypes.filter(
      (type) => typeof type !== 'string' || !EVENT_TYPE_PATTERN.test(type),
    );
    if (invalid.length > 0) {
      throw new BillingProblem(
        400,
        `${operation}.InvalidEventTypes`,
        `invalid event types: ${invalid.join(', ')}`,
      );
    }

    return { url, eventTypes: eventTypes as string[] };
  }
}
