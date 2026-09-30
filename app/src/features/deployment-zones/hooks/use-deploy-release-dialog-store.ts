import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { createDeployReleaseDialogStore } from '../store';

export function useDeployReleaseDialogStore(initialReleaseId: string) {
  const { store, actions } = useMemo(
    () => createDeployReleaseDialogStore(initialReleaseId),
    [initialReleaseId],
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    selectedReleaseId: state.selectedReleaseId,

    resetSelectedReleaseId: actions.resetSelectedReleaseId,
    setSelectedReleaseId: actions.setSelectedReleaseId,

    store,
  };
}
