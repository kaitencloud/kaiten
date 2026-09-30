// The contract is the generated client's (openapi.yaml): the model speaks its
// types, and checks every answer against its schemas, as the real API is held
// to them.
import {
  zGetNotificationPreferencesResponse,
  zListNotificationsResponse,
  zMarkNotificationsReadResponse,
} from '@/api-client/zod.gen';
import type {
  List,
  ListNotificationsData,
  MarkReadResult,
  Notification,
  PreferenceChoices,
  PreferenceMatrix,
  ReadSelection,
} from '@/api-client/types.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';

export type NotificationErrorOp = 'markRead' | 'putPreferences';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * The catalogue the backend owns
 * (api/internal/modules/notifications/catalogue), mirrored here so the
 * preference matrix and its validation behave like the real module.
 *
 * Event names and groups match that catalogue exactly. They used to be
 * plausible-looking inventions from before the module existed, which made every
 * mocked event sort into the "Other" group and hid the real grouping bug.
 */
const CATALOG = [
  {
    eventName: 'INSTANCE_CREATED',
    eventType: 'com.kaiten.instance.v1.created',
    label: 'Instance created',
    group: 'instances',
  },
  {
    eventName: 'INSTANCE_DEPLOYED',
    eventType: 'com.kaiten.instance.v1.deployed',
    label: 'Instance deployed',
    group: 'deployments',
  },
  {
    eventName: 'INSTANCE_DELETED',
    eventType: 'com.kaiten.instance.v1.deleted',
    label: 'Instance deleted',
    group: 'instances',
  },
  {
    eventName: 'INSTANCE_STATUS_CHANGED',
    eventType: 'com.kaiten.instance.v1.status_changed',
    label: 'Instance status changed',
    group: 'instances',
  },
  {
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    label: 'Entitlement near limit',
    group: 'usage',
  },
  {
    eventName: 'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
    eventType: 'com.kaiten.instance.entitlement.v1.cap_exceeded',
    label: 'Entitlement limit reached',
    group: 'usage',
  },
  {
    eventName: 'RELEASE_CREATED',
    eventType: 'com.kaiten.release.v1.created',
    label: 'Release published',
    group: 'deployments',
  },
  {
    eventName: 'COMPONENT_CREATED',
    eventType: 'com.kaiten.component.v1.created',
    label: 'Component added',
    group: 'deployments',
  },
] as const;

const CHANNELS = ['in_app'] as const;

const DEMO_TEMPLATES: Array<
  Pick<
    Notification,
    'eventName' | 'eventType' | 'objectType' | 'title' | 'body' | 'actionUrl'
  >
> = [
  {
    eventName: 'INSTANCE_DEPLOYED',
    eventType: 'com.kaiten.instance.v1.deployed',
    objectType: 'instance',
    title: 'Deployment of acme-prod succeeded',
    body: 'Instance acme-prod was updated to release 2.4.2.',
    actionUrl: '/releases',
  },
  {
    eventName: 'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
    eventType:
      'com.kaiten.instance.entitlement.v1.usage_warning_threshold_reached',
    objectType: 'instance',
    title: 'Acme Production is close to its Webhooks limit',
    body: 'Webhooks usage is at 9 of 10 (90%).',
    actionUrl: '/customers',
  },
  {
    eventName: 'INSTANCE_STATUS_CHANGED',
    eventType: 'com.kaiten.instance.v1.status_changed',
    objectType: 'instance',
    title: 'Webhook delivery to api.example.com failed',
    body: 'instance.updated → 502 Bad Gateway.',
    actionUrl: '/integrations/webhooks/history',
  },
  {
    eventName: 'INSTANCE_CREATED',
    eventType: 'com.kaiten.instance.v1.created',
    objectType: 'instance',
    title: 'New instance beta-eu created',
    body: 'Beta Industries provisioned beta-eu.',
    actionUrl: '/customers',
  },
];

export type NotificationAppModelSeed = {
  notifications?: Notification[];
  preferenceOverrides?: Record<string, Record<string, boolean>>;
  /** When set, connected mock SSE streams emit a demo notification on this interval. */
  streamDemoIntervalMs?: number;
};

export type SerializedNotificationAppModel = NotificationAppModelSeed & {
  pendingErrors: Array<[NotificationErrorOp, number]>;
  sequence: number;
};

const clone = <T>(value: T): T => structuredClone(value);

const byNewestFirst = (a: Notification, b: Notification) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

export class NotificationAppModel {
  readonly streamDemoIntervalMs?: number;
  private notifications: Notification[];
  private preferenceOverrides: Record<string, Record<string, boolean>>;
  private sequence: number;
  private readonly errors = new ErrorInjector<NotificationErrorOp>();

  constructor(seed: NotificationAppModelSeed = {}) {
    this.notifications = clone(seed.notifications ?? []).sort(byNewestFirst);
    this.preferenceOverrides = clone(seed.preferenceOverrides ?? {});
    this.streamDemoIntervalMs = seed.streamDemoIntervalMs;
    this.sequence = this.notifications.length + 1;
  }

  static fromSerialized(state: SerializedNotificationAppModel) {
    const model = new NotificationAppModel({
      notifications: state.notifications,
      preferenceOverrides: state.preferenceOverrides,
      streamDemoIntervalMs: state.streamDemoIntervalMs,
    });

    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);

    return model;
  }

  serializeForMsw(): SerializedNotificationAppModel {
    return {
      notifications: clone(this.notifications),
      preferenceOverrides: clone(this.preferenceOverrides),
      streamDemoIntervalMs: this.streamDemoIntervalMs,
      pendingErrors: this.errors.snapshot(),
      sequence: this.sequence,
    };
  }

  setNextError(op: NotificationErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  unreadCount(): number {
    return this.notifications.filter(
      (notification) => notification.readAt == null,
    ).length;
  }

  listNotifications(
    params: NonNullable<ListNotificationsData['query']> = {},
  ): List {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    // Like the API: the object filter narrows what the page AND its unread
    // count are about; the status only narrows the page.
    const objectTypes: readonly string[] = params.objectType ?? [];
    const about =
      objectTypes.length > 0
        ? this.notifications.filter((notification) =>
            objectTypes.includes(notification.objectType),
          )
        : this.notifications;
    const filtered =
      params.status === 'unread'
        ? about.filter((notification) => notification.readAt == null)
        : about;

    // An unknown cursor (e.g. the item left the unread filter after being
    // marked read) ends pagination instead of restarting at page one, which
    // would duplicate every item already shown.
    const cursorMatch = params.cursor
      ? filtered.findIndex((notification) => notification.id === params.cursor)
      : -1;
    const cursorIndex = params.cursor
      ? cursorMatch >= 0
        ? cursorMatch + 1
        : filtered.length
      : 0;
    const page = filtered.slice(cursorIndex, cursorIndex + limit);
    const hasMore = cursorIndex + limit < filtered.length;

    return parseContract(
      zListNotificationsResponse,
      {
        data: clone(page),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        unreadCount: about.filter((notification) => notification.readAt == null)
          .length,
      },
      'NotificationAppModel.listNotifications result',
    );
  }

  markRead(input: ReadSelection): MarkReadResult {
    this.errors.consume('markRead');

    if (input.all && input.ids?.length) {
      throw Object.assign(new Error('Pass either "ids" or "all", not both'), {
        httpStatus: 400,
      });
    }
    if (!input.all && !input.ids?.length) {
      throw Object.assign(new Error('Pass "ids" or "all: true"'), {
        httpStatus: 400,
      });
    }

    const targetIds = input.all ? null : new Set(input.ids ?? []);
    const readAt = new Date().toISOString();
    let updated = 0;

    this.notifications = this.notifications.map((notification) => {
      const isTargeted = targetIds === null || targetIds.has(notification.id);
      if (!isTargeted || notification.readAt != null) {
        return notification;
      }
      updated += 1;
      return { ...notification, readAt: readAt };
    });

    return parseContract(
      zMarkNotificationsReadResponse,
      { updated, unreadCount: this.unreadCount() },
      'NotificationAppModel.markRead result',
    );
  }

  getPreferences(): PreferenceMatrix {
    const events = CATALOG.map((entry) => ({
      eventName: entry.eventName,
      eventType: entry.eventType,
      label: entry.label,
      group: entry.group,
      channels: Object.fromEntries(
        CHANNELS.map((channel) => [
          channel,
          this.preferenceOverrides[entry.eventName]?.[channel] ?? true,
        ]),
      ),
    }));

    return parseContract(
      zGetNotificationPreferencesResponse,
      { channels: [...CHANNELS], events },
      'NotificationAppModel.getPreferences result',
    );
  }

  putPreferences(input: PreferenceChoices): PreferenceMatrix {
    this.errors.consume('putPreferences');
    const events = input.events ?? [];

    // Validate everything before applying anything: a 422 must not leave the
    // request half-applied.
    for (const event of events) {
      const known = CATALOG.some(
        (entry) => entry.eventName === event.eventName,
      );
      if (!known) {
        throw Object.assign(
          new Error(`unknown eventName "${event.eventName}"`),
          { httpStatus: 422 },
        );
      }
      for (const channel of Object.keys(event.channels)) {
        if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
          throw Object.assign(new Error(`unknown channel "${channel}"`), {
            httpStatus: 422,
          });
        }
      }
    }

    for (const event of events) {
      this.preferenceOverrides[event.eventName] = {
        ...this.preferenceOverrides[event.eventName],
        ...event.channels,
      };
    }

    return this.getPreferences();
  }

  /** Create one notification from the rotating demo templates (mock SSE). */
  emitDemoNotification(): Notification {
    const template = DEMO_TEMPLATES[this.sequence % DEMO_TEMPLATES.length];
    this.sequence += 1;
    const notification: Notification = {
      id: `ntf-live-${this.sequence}`,
      createdAt: new Date().toISOString(),
      ...template,
    };
    this.notifications.unshift(notification);
    return clone(notification);
  }
}
