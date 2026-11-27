import { describe, expect, it } from 'vite-plus/test';
import { detectWebhookChatService } from '../webhook-chat-destination';

describe('detectWebhookChatService', () => {
  it.each([
    ['https://hooks.slack.com/services/T000/B000/XXXX', 'slack'],
    ['  https://hooks.slack.com/services/T000/B000/XXXX  ', 'slack'],
    ['https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k', 'googleChat'],
    ['https://hooks.slack.com/workflows/T000/A000/1/XXXX', null],
    ['https://HOOKS.SLACK.COM/services/T000/B000/XXXX', null],
    ['https://api.example.com/webhooks/kaiten', null],
    ['', null],
  ])('reads %s as %s, as saas-api does', (url, service) => {
    expect(detectWebhookChatService(url)).toBe(service);
  });
});
