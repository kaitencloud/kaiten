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
