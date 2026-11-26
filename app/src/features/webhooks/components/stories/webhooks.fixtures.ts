import type {
  ApiWebhook,
  Webhook,
  WebhookHistoryEntry,
  WebhookMessage,
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
    id: 'webhook-customers',
    signingSecret: 'whsec_customer_story',
    updatedAt: storyYesterday,
    url: 'https://hooks.example.com/customers',
  },
  {
    createdAt: storyYesterday,
    eventTypes: ['com.kaiten.release.v1.created', 'com.kaiten.instance.v1.deployed'],
    id: 'webhook-release-ops',
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
