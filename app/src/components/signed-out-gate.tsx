import { RedirectToSignIn } from '@clerk/react';
import { useState } from 'react';
import { purgeAllFormRecovery } from '@/lib/form-recovery';
import { getLastKnownIdentity } from '@/lib/session-identity';

/** Where Clerk sends a person who signed out on purpose. */
export const SIGNED_OUT_PATH = '/signed-out';

/**
 * What the app shows to someone who is not signed in. A session that merely
 * expired lands on the sign-in page at the URL it was on, and keeps what it
 * stored; an explicit sign-out lands here first, on {@link SIGNED_OUT_PATH},
 * and the stored input of creation forms is purged before the sign-in page
 * comes, with a mark that stops any other open tab from writing it again.
 *
 * The purge runs before the first render of the sign-in redirect, so that the
 * URL it remembers is already `/`.
 */
export function SignedOutGate() {
  useState(() => {
    if (window.location.pathname === SIGNED_OUT_PATH) {
      purgeAllFormRecovery(getLastKnownIdentity()?.userId ?? null);
      window.history.replaceState(null, '', '/');
    }
    return true;
  });

  return <RedirectToSignIn />;
}
