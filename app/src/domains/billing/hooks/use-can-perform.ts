import { type BillingAction, canPerformAction } from '../logic';
import { useGrantedScopes } from './use-granted-scopes';

export type ActionAccess = {
  /** Whether the session may perform the action, as far as its scopes say. */
  allowed: boolean;
  /** Whether the token is still being read, so that `allowed` is not an answer yet. */
  isPending: boolean;
};

/**
 * What the signed-in session's scopes say of `action`, and whether they are known
 * yet. For a screen that must tell "not allowed" from "not known yet", such as a
 * link that is dropped when it cannot be followed: it must not be dropped before
 * the token has been read. `allowed` is false while it is.
 */
export function useActionAccess(action: BillingAction): ActionAccess {
  const { isPending, scopes } = useGrantedScopes();

  return { allowed: !isPending && canPerformAction(scopes, action), isPending };
}

/**
 * Whether the signed-in session holds the scope `action` needs, for a screen to
 * show or hide it. False while the token is being read. When the token does not
 * say which scopes it carries, true: the action is offered, and a refusal of the
 * API (403 `Auth.MissingScope`) is shown as a banner naming the scope.
 */
export function useCanPerform(action: BillingAction): boolean {
  return useActionAccess(action).allowed;
}
