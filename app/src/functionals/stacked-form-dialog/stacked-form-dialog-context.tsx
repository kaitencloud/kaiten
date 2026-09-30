import { createContext, use, useEffect } from 'react';

export type StackedFormDialogContextValue = {
  title: string;
  requestClose: () => void;
  setDirty: (dirty: boolean | undefined) => void;
};

export const StackedFormDialogContext =
  createContext<StackedFormDialogContextValue | null>(null);

export function useStackedFormDialogContext() {
  const context = use(StackedFormDialogContext);
  if (!context) {
    throw new Error(
      'StackedFormDialogCard must be rendered inside a StackedFormDialog',
    );
  }
  return context;
}

/**
 * Closes the enclosing dialog the way its own close button does, discard
 * prompt included. Undefined outside a dialog.
 */
export function useStackedFormDialogClose(): (() => void) | undefined {
  return use(StackedFormDialogContext)?.requestClose;
}

/**
 * Tells the enclosing dialog whether closing would lose anything. Until a form
 * reports it, the dialog assumes it would and asks before closing.
 */
export function StackedFormDialogDirtyState({ dirty }: { dirty: boolean }) {
  const setDirty = use(StackedFormDialogContext)?.setDirty;

  useEffect(() => {
    setDirty?.(dirty);
  }, [dirty, setDirty]);

  useEffect(() => () => setDirty?.(undefined), [setDirty]);

  return null;
}
