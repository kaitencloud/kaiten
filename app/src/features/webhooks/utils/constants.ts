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
