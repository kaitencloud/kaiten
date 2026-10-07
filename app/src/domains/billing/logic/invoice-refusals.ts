import { getProblem, getProblemValueMember } from './billing-problem';

/**
 * Why a recompose was refused, when the refusal changes what the screen offers
 * next and not only what it says.
 */
export type RecomposeRefusal =
  /** The invoice is neither a held draft nor a void invoice: it has to be voided first. */
  | { kind: 'needs-void' }
  /** The void invoice was recomposed already: its replacement is where the person goes. */
  | { kind: 'already-replaced'; replacementInvoiceId: string }
  /** The instance of the invoice was deleted: there is no usage left to measure again. */
  | { kind: 'instance-deleted' };

/**
 * Reads the refusal of a recompose. Nothing for any other failure, which the
 * screen shows as the API wrote it. A refusal because the boundary has a live
 * invoice already, which does not say which, is not an `already-replaced`: with
 * no replacement to go to it is just a refusal.
 */
export function readRecomposeRefusal(
  error: unknown,
): RecomposeRefusal | undefined {
  const problem = getProblem(error);

  switch (problem?.code) {
    case 'RecomposeInvoice.InvalidStatus':
      return { kind: 'needs-void' };
    case 'RecomposeInvoice.InstanceDeleted':
      return { kind: 'instance-deleted' };
    case 'RecomposeInvoice.AlreadyReplaced': {
      const replacementInvoiceId = getProblemValueMember(
        problem.errors ?? [],
        'replacementInvoiceId',
      );

      return replacementInvoiceId
        ? { kind: 'already-replaced', replacementInvoiceId }
        : undefined;
    }
    default:
      return undefined;
  }
}
