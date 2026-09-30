import { Store } from '@tanstack/react-store';

export type DeployReleaseDialogStoreState = {
  selectedReleaseId: string;
};

export type DeployReleaseDialogStoreActions = {
  resetSelectedReleaseId: () => void;
  setSelectedReleaseId: (releaseId: string) => void;
};

export function createDeployReleaseDialogStore(initialReleaseId: string) {
  const initialSelectedReleaseId = initialReleaseId;
  const store = new Store<DeployReleaseDialogStoreState>({
    selectedReleaseId: initialSelectedReleaseId,
  });

  const actions: DeployReleaseDialogStoreActions = {
    resetSelectedReleaseId: () => {
      store.setState((state) => ({
        ...state,
        selectedReleaseId: initialSelectedReleaseId,
      }));
    },

    setSelectedReleaseId: (releaseId: string) => {
      store.setState((state) => ({
        ...state,
        selectedReleaseId: releaseId,
      }));
    },
  };

  return { store, actions };
}

export type DeployReleaseDialogStore = ReturnType<
  typeof createDeployReleaseDialogStore
>;
