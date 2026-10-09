import { createContext, type PropsWithChildren, use } from 'react';
import type { InstanceAddonActions } from '../../../../../hooks/use-instance-addon-actions';

const InstanceAddonActionsContext = createContext<InstanceAddonActions | null>(
  null,
);

/**
 * What the cells of the list of add-ons ask of the card around it: the change being
 * made, and the way to make one. A cell of the table is a component of its own, kept
 * by the identity of its column, so the table cannot take these as props without
 * rebuilding its columns at each change and taking a confirmation dialog down with
 * the cell that opened it.
 */
export function InstanceAddonActionsProvider({
  actions,
  children,
}: PropsWithChildren<{ actions: InstanceAddonActions }>) {
  return (
    <InstanceAddonActionsContext.Provider value={actions}>
      {children}
    </InstanceAddonActionsContext.Provider>
  );
}

export function useInstanceAddonActionsContext(): InstanceAddonActions {
  const actions = use(InstanceAddonActionsContext);

  if (!actions) {
    throw new Error(
      'useInstanceAddonActionsContext must be used within an InstanceAddonActionsProvider',
    );
  }

  return actions;
}
