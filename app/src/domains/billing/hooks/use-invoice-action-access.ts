import {
  canPerformAction,
  INVOICE_ACTION_SCOPES,
  type InvoiceAction,
} from '../logic';
import { useGrantedScopes } from './use-granted-scopes';

const INVOICE_ACTIONS = Object.keys(INVOICE_ACTION_SCOPES) as InvoiceAction[];

/**
 * What the signed-in session's scopes say of each action on an invoice, read once.
 * The scope of an action is the one `INVOICE_ACTION_SCOPES` names for it, so a
 * screen asks for none by hand. As with `useCanPerform`, nothing is allowed while
 * the token is being read, and everything is when the token says nothing about
 * its scopes: the API refuses what the session may not do.
 */
export function useInvoiceActionAccess(): Record<InvoiceAction, boolean> {
  const { isPending, scopes } = useGrantedScopes();

  return Object.fromEntries(
    INVOICE_ACTIONS.map((action) => [
      action,
      !isPending && canPerformAction(scopes, INVOICE_ACTION_SCOPES[action]),
    ]),
  ) as Record<InvoiceAction, boolean>;
}
