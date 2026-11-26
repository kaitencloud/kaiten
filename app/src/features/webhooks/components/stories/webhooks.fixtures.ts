import type {
  ApiWebhook,
  Webhook,
  WebhookHistoryEntry,
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
  },
  {
    date: storyYesterday,
    eventType: 'com.kaiten.release.v1.created',
    hookId: storyApiWebhooks[1].id,
    hookUrl: storyApiWebhooks[1].url,
    responseStatusCode: 500,
    responseStatusText: 'Internal server error while syncing release.',
    status: 'fail',
  },
  {
    date: storyLastWeek,
    eventType: 'com.kaiten.instance.v1.deployed',
    hookId: storyApiWebhooks[1].id,
    hookUrl: storyApiWebhooks[1].url,
    status: 'pending',
  },
] satisfies WebhookHistoryEntry[];

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
