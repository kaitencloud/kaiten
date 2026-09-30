import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import { createDeploymentZoneFormDialogStore } from '../store';

export function useDeploymentZoneFormDialogStore(initialFeaturesJson: string) {
  const [{ store, actions }] = useState(() =>
    createDeploymentZoneFormDialogStore(initialFeaturesJson),
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    featuresError: state.featuresError,
    featuresJson: state.featuresJson,

    resetFeaturesState: actions.resetFeaturesState,
    setFeaturesError: actions.setFeaturesError,
    setFeaturesJson: actions.setFeaturesJson,

    store,
  };
}
