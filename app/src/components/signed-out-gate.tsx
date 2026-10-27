import { RedirectToSignIn } from '@clerk/react';
import { useEffect } from 'react';
import { purgeAllFormRecovery } from '@/lib/form-recovery';
import {
  clearLastKnownIdentity,
  getLastKnownIdentity,
} from '@/lib/session-identity';

/** Where Clerk sends a person who signed out on purpose. */
export const SIGNED_OUT_PATH = '/signed-out';

/**
 * The purge of an explicit sign-out. An effect, not part of a render; it sits
 * before the redirect among its siblings, and effects of siblings run in
 * order, so the URL the redirect remembers is already `/` when it reads it.
 */
function PurgeAtSignOut() {
  useEffect(() => {
    if (window.location.pathname !== SIGNED_OUT_PATH) return;

    purgeAllFormRecovery(getLastKnownIdentity()?.userId ?? null);
    clearLastKnownIdentity();
    window.history.replaceState(null, '', '/');
  }, []);

  return null;
}

/**
 * What the app shows to someone who is not signed in. A session that merely
 * expired lands on the sign-in page at the URL it was on, and keeps what it
 * stored; an explicit sign-out lands here first, on {@link SIGNED_OUT_PATH},
 * and the stored input of creation forms is purged before the sign-in page
 * comes, with a mark that stops any other open tab from writing it again.
 */
export function SignedOutGate() {
  return (
    <>
      <PurgeAtSignOut />
      <RedirectToSignIn />
    </>
  );
}
