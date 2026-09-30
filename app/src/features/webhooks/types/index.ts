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

export interface CreateWebhookInput {
  eventTypes: string[];
  url: string;
}

export interface WebhookHistoryEntry {
  date: string;
  hookId: string;
  hookUrl: string;
  /** Empty when the delivery's message could not be looked up. */
  eventType: string;
  status: WebhookDeliveryStatus;
  responseStatusCode?: number;
  responseStatusText?: string;
}

export interface WebhookHistoryResponse {
  history: WebhookHistoryEntry[];
}
