import type { Page } from '@playwright/test';

/**
 * The scopes of the people the billing specs sign in as. They are the claims
 * of the token of a session, which is where the console reads them from.
 */
export const SESSION_SCOPES = {
  /** Everything. */
  admin: ['read:*', 'write:*'],
  /** Reads what billing shows, and acts on none of it. */
  reader: [
    'read:billing',
    'read:licenses',
    'read:instances',
    'read:customers',
    'read:addons',
    'read:vouchers',
  ],
  /** Applies and settles, as an account executive does. */
  sales: [
    'read:billing',
    'write:billing',
    'read:instances',
    'write:instances',
    'read:licenses',
    'read:voucher_redemptions',
    'write:voucher_redemptions',
  ],
} as const satisfies Record<string, readonly string[]>;

const base64Url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * A JWT whose `scopes` claim is `scopes`. It is not signed: the console reads
 * the claim to show the actions a session may take, and never verifies it, since
 * the API does on every request.
 */
export function sessionTokenWithScopes(scopes: readonly string[]): string {
  return [
    base64Url({ alg: 'none', typ: 'JWT' }),
    base64Url({ scopes, sub: 'user-e2e' }),
    '',
  ].join('.');
}

/**
 * Signs the page in as a session whose token carries `scopes`, before it loads.
 * The application suite has no identity provider, so the console falls back to
 * the `__session` cookie for the token of the session, which is where a session
 * token of Clerk lives as well. Every request of the page then carries it, and
 * the actions offered follow it: a spec that asserts what a person who may not
 * write sees signs in as a reader.
 *
 * A page that does not call it has a token that says nothing about scopes, and
 * is offered every action.
 */
export async function signInWithScopes(
  page: Page,
  scopes: readonly string[],
): Promise<void> {
  await page.context().addCookies([
    {
      domain: '127.0.0.1',
      name: '__session',
      path: '/',
      value: sessionTokenWithScopes(scopes),
    },
  ]);
}
