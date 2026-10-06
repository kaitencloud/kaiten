import { type BillingAction, canPerformAction } from '../logic';
import { useGrantedScopes } from './use-granted-scopes';

/**
 * Whether the signed-in session holds the scope `action` needs, for a screen to
 * show or hide it. False while the token is being read. When the token does not
 * say which scopes it carries, true: the action is offered, and a refusal of the
 * API (403 `Auth.MissingScope`) is shown as a banner naming the scope.
 */
export function useCanPerform(action: BillingAction): boolean {
  const { isPending, scopes } = useGrantedScopes();

  return !isPending && canPerformAction(scopes, action);
}
