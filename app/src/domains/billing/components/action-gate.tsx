import type { ReactNode } from 'react';
import { RestrictedAccess } from '@/components/route/restricted-access';
import { useActionAccess } from '../hooks/use-can-perform';
import { type BillingAction, getActionScopes } from '../logic';

type ActionGateProps = {
  /** The action the form or the dialog does. */
  action: BillingAction;
  children: ReactNode;
  /**
   * What to draw in its place when the session may not: the restricted state, for a page
   * the address leads to. Nothing by default, for a dialog, which stands over a page that is
   * still there.
   */
  restricted?: boolean;
};

/**
 * Draws a form only for a session whose scopes cover the action it sends. The buttons that
 * lead to a form are hidden from a session that may not use it, but the address of a form
 * can be opened by hand, and a form that opens for a session that cannot send it ends in
 * a 403 after everything was typed. Nothing is drawn while the token is being read, and a
 * token that does not say what it carries is allowed, as everywhere (`canPerformAction`).
 */
export function ActionGate({
  action,
  children,
  restricted = false,
}: ActionGateProps) {
  const { allowed, isPending } = useActionAccess(action);

  if (allowed) {
    return children;
  }
  if (isPending || !restricted) {
    return null;
  }

  return (
    <RestrictedAccess
      reason={`missing required scope: ${getActionScopes(action).join(', ')}`}
    />
  );
}
