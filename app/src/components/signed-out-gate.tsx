import { RedirectToSignIn } from '@clerk/react';
import { useEffect, useState } from 'react';
import { purgeAllFormRecovery } from '@/lib/form-recovery';
import {
  clearLastKnownIdentity,
  getLastKnownIdentity,
} from '@/lib/session-identity';

/** Where Clerk sends a person who signed out on purpose. */
export const SIGNED_OUT_PATH = '/signed-out';

/**
 * What the app shows to someone who is not signed in. A session that merely
 * expired lands on the sign-in page at the URL it was on, and keeps what it
 * stored; an explicit sign-out lands here first, on {@link SIGNED_OUT_PATH},
 * and the stored input of creation forms is purged before the sign-in page
 * comes, with a mark that stops any other open tab from writing it again.
 *
 * The purge runs before the sign-in redirect is rendered, so that the URL it
 * remembers is already `/`: the redirect is held back until then. The purge is
 * an effect, not part of a render.
 */
export function SignedOutGate() {
  const [ready, setReady] = useState(
    () => window.location.pathname !== SIGNED_OUT_PATH,
  );

  useEffect(() => {
    if (window.location.pathname === SIGNED_OUT_PATH) {
      purgeAllFormRecovery(getLastKnownIdentity()?.userId ?? null);
      clearLastKnownIdentity();
      window.history.replaceState(null, '', '/');
    }
    setReady(true);
  }, []);

  return ready ? <RedirectToSignIn /> : null;
}
