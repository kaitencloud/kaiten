import { Store } from '@tanstack/react-store';

export type DeploymentZoneFormDialogStoreState = {
  featuresError: string | null;
  featuresJson: string;
};

export type DeploymentZoneFormDialogStoreActions = {
  resetFeaturesState: (featuresJson: string) => void;
  setFeaturesError: (error: string | null) => void;
  setFeaturesJson: (featuresJson: string) => void;
};

export function createDeploymentZoneFormDialogStore(
  initialFeaturesJson: string,
) {
  const store = new Store<DeploymentZoneFormDialogStoreState>({
    featuresError: null,
    featuresJson: initialFeaturesJson,
  });

  const actions: DeploymentZoneFormDialogStoreActions = {
    resetFeaturesState: (featuresJson: string) => {
      store.setState((state) => ({
        ...state,
        featuresError: null,
        featuresJson,
      }));
    },

    setFeaturesError: (error: string | null) => {
      store.setState((state) => ({
        ...state,
        featuresError: error,
      }));
    },

    setFeaturesJson: (featuresJson: string) => {
      store.setState((state) => ({
        ...state,
        featuresJson,
      }));
    },
  };

  return { store, actions };
}

export type DeploymentZoneFormDialogStore = ReturnType<
  typeof createDeploymentZoneFormDialogStore
>;
