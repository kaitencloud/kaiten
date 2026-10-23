import { Show } from '@clerk/react';
import type { ReactNode } from 'react';
import { ClerkProvider } from './clerk-provider';
import { SignedOutGate } from './signed-out-gate';

/**
 * The sign-in boundary of the app: `children` for a signed-in session, the
 * {@link SignedOutGate} (the sign-out purge, then the sign-in page) for none.
 * Clerk sends an explicit sign-out to the gate's own path before it renders the
 * signed-out state.
 */
export function ClerkGate({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <SignedOutGate />
      </Show>
    </ClerkProvider>
  );
}
