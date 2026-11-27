import type {
  ApiWebhook,
  Webhook,
  WebhookDeliveryTone,
  WebhookHistoryEntry,
  WebhookMessage,
  WebhookMessageAttempt,
  WebhookMessageList,
  WebhookMessageSummary,
} from '../../types';
import {
  storyLastWeek,
  storyNow,
  storyYesterday,
} from '@/test-fixtures/storybook-core-fixtures';

export const storyApiWebhooks = [
  {
    createdAt: storyLastWeek,
    eventTypes: ['com.kaiten.customer.v1.created', 'com.kaiten.customer.v1.updated'],
    id: 'ep_story_customers',
    signingSecret: 'whsec_customer_story',
    updatedAt: storyYesterday,
    url: 'https://hooks.example.com/customers',
  },
  {
    createdAt: storyYesterday,
    eventTypes: ['com.kaiten.release.v1.created', 'com.kaiten.instance.v1.deployed'],
    id: 'ep_story_release_ops',
    updatedAt: storyNow,
    url: 'https://ops.example.com/kaiten',
  },
] satisfies ApiWebhook[];

export const storyWebhooks = [
  {
    createdAt: storyApiWebhooks[0].createdAt,
    eventTypes: storyApiWebhooks[0].eventTypes,
    id: storyApiWebhooks[0].id,
    signingSecret: storyApiWebhooks[0].signingSecret,
    url: storyApiWebhooks[0].url,
  },
  {
    createdAt: storyApiWebhooks[1].createdAt,
    eventTypes: storyApiWebhooks[1].eventTypes,
    id: storyApiWebhooks[1].id,
    url: storyApiWebhooks[1].url,
  },
] satisfies Webhook[];

export const storyWebhookHistory = [
  {
    date: storyNow,
    eventType: 'com.kaiten.customer.v1.created',
    hookId: storyApiWebhooks[0].id,
    hookUrl: storyApiWebhooks[0].url,
    responseStatusCode: 200,
    responseStatusText: 'OK',
    status: 'success',
    messageId: 'msg_story_customer',
    attemptId: 'atmpt_story_customer',
    responseDurationMs: 84,
    triggerType: 'scheduled',
  },
  {
    date: storyYesterday,
    eventType: 'com.kaiten.release.v1.created',
    hookId: storyApiWebhooks[1].id,
    hookUrl: storyApiWebhooks[1].url,
    responseStatusCode: 500,
    responseStatusText: 'Internal server error while syncing release.',
    status: 'fail',
    messageId: 'msg_story_release',
    attemptId: 'atmpt_story_release_2',
    responseDurationMs: 1204,
    triggerType: 'scheduled',
  },
  {
    date: storyLastWeek,
    eventType: 'com.kaiten.instance.v1.deployed',
    hookId: storyApiWebhooks[1].id,
    hookUrl: storyApiWebhooks[1].url,
    status: 'pending',
  },
] satisfies WebhookHistoryEntry[];

/** The release message of the history: two failed attempts, then a manual resend in flight. */
export const storyWebhookReleaseMessage = {
  messageId: 'msg_story_release',
  eventType: 'com.kaiten.release.v1.created',
  timestamp: storyYesterday,
  payloadAvailable: true,
  payload: {
    name: 'RELEASE_CREATED',
    type: 'com.kaiten.release.v1.created',
    data: { slug: 'v2-4-0', name: 'v2.4.0' },
  },
  attempts: [
    {
      id: 'atmpt_story_release_3',
      timestamp: storyNow,
      status: 'sending',
      triggerType: 'manual',
    },
    {
      id: 'atmpt_story_release_2',
      timestamp: storyYesterday,
      status: 'fail',
      responseStatusCode: 500,
      response: 'Internal server error while syncing release.',
      responseDurationMs: 1204,
      triggerType: 'scheduled',
    },
    {
      id: 'atmpt_story_release_1',
      timestamp: storyLastWeek,
      status: 'fail',
      triggerType: 'scheduled',
    },
  ],
} satisfies WebhookMessage;

// A short placeholder: a Slack incoming-webhook URL is a credential, so no
// real one is ever written in a story.
export const STORY_SLACK_URL =
  'https://hooks.slack.com/services/T000/B000/XXXX';

export const STORY_GOOGLE_CHAT_URL =
  'https://chat.googleapis.com/v1/spaces/AAAAAAAAAAA/messages?key=placeholder';

/** A webhook holding a whole group (Customers) and a few single events. */
export const storyWebhookManyEvents = {
  createdAt: storyLastWeek,
  eventTypes: [
    'com.kaiten.customer.v1.created',
    'com.kaiten.customer.v1.updated',
    'com.kaiten.customer.v1.deleted',
    'com.kaiten.customer.v1.creation_rejected',
    'com.kaiten.instance.v1.created',
    'com.kaiten.license.v1.created',
  ],
  id: 'ep_many_events',
  updatedAt: storyYesterday,
  url: 'https://hooks.example.com/kaiten',
} satisfies ApiWebhook;

/**
 * A webhook holding events the picker does not offer: one offered by no group,
 * and one newer than the console.
 */
export const storyWebhookOtherEvents = {
  createdAt: storyLastWeek,
  eventTypes: [
    'com.kaiten.customer.v1.created',
    'com.kaiten.feature_flag.v1.evaluated',
    'com.kaiten.future.v1.created',
  ],
  id: 'ep_other_events',
  updatedAt: storyYesterday,
  url: 'https://hooks.example.com/other',
} satisfies ApiWebhook;

const STORY_EVENT_TYPES = [
  'com.kaiten.instance.v1.created',
  'com.kaiten.release.v1.created',
  'com.kaiten.customer.v1.updated',
  'com.kaiten.instance.v1.deployed',
];

const SEVEN_MINUTES = 7 * 60_000;

function storyLastAttempt(
  index: number,
  tone: WebhookDeliveryTone,
  at: number,
): WebhookMessageAttempt | undefined {
  if (tone === 'pending') {
    return undefined;
  }
  const status = tone === 'retrying' ? 'fail' : tone;
  const answered = status === 'success' || index % 2 === 0;

  return {
    id: `atmpt_story_${String(index).padStart(2, '0')}`,
    timestamp: new Date(at + 1_000).toISOString(),
    status,
    ...(status === 'sending'
      ? {}
      : answered
        ? {
            responseStatusCode: status === 'success' ? 200 : 503,
            responseDurationMs: 60 + index * 7,
          }
        : {}),
    triggerType: 'scheduled',
  };
}

/**
 * `count` messages of a webhook, newest first, seven minutes apart from
 * `newest`, each in the state `toneAt` gives it: a failed message waiting for
 * a retry is `retrying`.
 */
export function buildStoryMessages(
  count: number,
  toneAt: (index: number) => WebhookDeliveryTone = () => 'success',
  newest: string = storyNow,
): WebhookMessageSummary[] {
  const start = Date.parse(newest);

  return Array.from({ length: count }, (_, index) => {
    const tone = toneAt(index);
    const at = start - index * SEVEN_MINUTES;
    const lastAttempt = storyLastAttempt(index, tone, at);
    const attemptCount = tone === 'fail' || tone === 'retrying' ? 3 : 1;

    return {
      messageId: `msg_story_${String(index).padStart(2, '0')}`,
      eventType: STORY_EVENT_TYPES[index % STORY_EVENT_TYPES.length],
      timestamp: new Date(at).toISOString(),
      status: tone === 'retrying' ? 'pending' : tone,
      ...(tone === 'retrying'
        ? { nextAttempt: new Date(at + 3_600_000).toISOString() }
        : {}),
      ...(lastAttempt ? { attemptCount, lastAttempt } : {}),
    };
  });
}

/**
 * `GET /webhooks/{id}/messages` for a webhook of the stories: the messages,
 * without their attempts when the console asks for none, and their summary.
 */
export function buildStoryMessageList(
  webhook: ApiWebhook,
  messages: WebhookMessageSummary[],
  { withAttempts = true }: { withAttempts?: boolean } = {},
): WebhookMessageList {
  const count = (status: WebhookMessageSummary['status']) =>
    messages.filter((message) => message.status === status).length;

  return {
    webhook: {
      id: webhook.id,
      url: webhook.url,
      createdAt: webhook.createdAt ?? storyLastWeek,
      updatedAt: webhook.updatedAt ?? webhook.createdAt ?? storyLastWeek,
    },
    messages: withAttempts
      ? messages
      : messages.map(({ attemptCount: _count, lastAttempt: _last, ...rest }) => rest),
    summary: {
      total: messages.length,
      delivered: count('success'),
      failed: count('fail'),
      pending: count('pending') + count('sending'),
    },
    hasMore: false,
  };
}

/** The recent deliveries of the stories' two webhooks: a mix, and a clean run. */
export const storyWebhookMessages: Record<string, WebhookMessageSummary[]> = {
  [storyApiWebhooks[0].id]: buildStoryMessages(20, (index) =>
    index === 0 ? 'sending' : index === 3 || index === 9 ? 'fail' : index === 1 ? 'retrying' : 'success',
  ),
  [storyApiWebhooks[1].id]: buildStoryMessages(6, () => 'success', storyYesterday),
};
