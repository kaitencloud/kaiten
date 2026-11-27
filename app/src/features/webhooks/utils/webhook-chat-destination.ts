/** A chat service saas-api formats events for, by the target URL. */
export type WebhookChatService = 'slack' | 'googleChat';

/** The service's name, a proper noun the page does not translate. */
export const WEBHOOK_CHAT_SERVICE_NAMES: Record<WebhookChatService, string> = {
  slack: 'Slack',
  googleChat: 'Google Chat',
};

/**
 * The chat service a target URL belongs to, or null. It mirrors saas-api's
 * create handler exactly: a case-sensitive substring of the URL as sent. A Slack
 * workflow URL (hooks.slack.com/workflows/) is not a chat webhook.
 */
export function detectWebhookChatService(
  rawUrl: string,
): WebhookChatService | null {
  const url = rawUrl.trim();
  if (url.includes('hooks.slack.com/services/')) return 'slack';
  if (url.includes('chat.googleapis.com/v1/spaces/')) return 'googleChat';
  return null;
}
