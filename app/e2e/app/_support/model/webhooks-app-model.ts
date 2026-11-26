import { type ArmedBillingProblem, ArmedProblems } from './armed-problems';
import { BillingProblem } from './billing-problem';

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
export type WebhookOperation = 'createWebhook' | 'updateWebhook' | 'getWebhook';

/** A write saas-api accepted, in order: what a spec asserts was sent. */
export type AcceptedWebhookWrite =
  | { operation: 'create'; webhookId: string; body: WebhookBody }
  | { operation: 'update'; webhookId: string; body: WebhookBody }
  | { operation: 'delete'; webhookId: string };

export type WebhookRefusal =
  | 'svixValidation'
  | 'svixNotFound'
  | 'notEntitled'
  | 'missingScope';

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
};

// saas-api's own pattern for an event type (subscriptions/schema/schema.go),
// copied rather than imported: the model stands for the server.
const EVENT_TYPE_PATTERN =
  /^com\.kaiten\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*\.v[1-9][0-9]*\.[a-z][a-z0-9_]*$/;

// A fixed clock that moves a minute per write: the dates are stable from run to run.
const START = Date.parse('2026-11-20T09:00:00Z');
const MINUTE = 60_000;

export type SerializedWebhooksAppModel = {
  webhooks: MockedWebhook[];
  problems: Array<[WebhookOperation, ArmedBillingProblem]>;
  writes: AcceptedWebhookWrite[];
  sequence: number;
};

const notFound = () => {
  const { code, detail, status } = WEBHOOK_REFUSALS.svixNotFound;
  return new BillingProblem(status, code, detail);
};

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
 */
export class WebhooksAppModel {
  private webhooks: MockedWebhook[];
  private problems = new ArmedProblems<WebhookOperation>();
  private readonly writes: AcceptedWebhookWrite[] = [];
  private sequence = 0;

  constructor({ webhooks = [] }: { webhooks?: MockedWebhookSeed[] } = {}) {
    checkSeed(webhooks);
    this.webhooks = webhooks.map((webhook) => ({
      signingSecret: `whsec_mock_${webhook.id}`,
      createdAt: new Date(START).toISOString(),
      updatedAt: new Date(START).toISOString(),
      ...structuredClone(webhook),
    }));
  }

  static fromSerialized(state: SerializedWebhooksAppModel): WebhooksAppModel {
    const model = new WebhooksAppModel({ webhooks: state.webhooks });
    model.problems = ArmedProblems.from(state.problems);
    model.writes.push(...structuredClone(state.writes));
    model.sequence = state.sequence;

    return model;
  }

  serializeForMsw(): SerializedWebhooksAppModel {
    return {
      webhooks: structuredClone(this.webhooks),
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
