import { useBillingProvider, useCanPerform } from '@/domains/billing';

/**
 * Whether the list of invoices offers its handoff view: the organization collects
 * through NoOp, whose invoices wait in the queue its accounting system reads, and
 * the session holds the scope to read that queue. Nothing is offered while the
 * capabilities load or when billing is off, and the scopes of the token are read
 * before the view is: an entry that appears a moment later is better than one that
 * vanishes.
 */
export function useHandoffViewAvailable(): boolean {
  const noop = useBillingProvider('NOOP');
  const canListHandoff = useCanPerform('handoff.list');

  return noop.isConnected && canListHandoff;
}
