import type { ApiScope, ApiScopeResource } from '@/lib/api/scopes.gen';

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * The scope a resend needs; reading deliveries needs `read:webhooks`. Spelled
 * from the generated scope tables, which saas-api enforces, so that a renamed
 * scope fails the type check here.
 */
const WEBHOOKS_SCOPE_RESOURCE: ApiScopeResource = 'webhooks';
export const WRITE_WEBHOOKS_SCOPE: ApiScope = `write:${WEBHOOKS_SCOPE_RESOURCE}`;

/** The recent deliveries the table's strip shows, one bar per message. */
export const WEBHOOK_STRIP_SIZE = 20;

/** The deliveries the dialog lists: saas-api's default page of messages. */
export const WEBHOOK_DELIVERIES_LIMIT = 50;
