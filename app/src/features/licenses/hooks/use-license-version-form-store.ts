import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import { createLicenseVersionFormStore } from '../store';

export function useLicenseVersionFormStore(initialBaseLicenseSlug = '') {
  const [{ store, actions }] = useState(() =>
    createLicenseVersionFormStore(initialBaseLicenseSlug),
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    hasInitializedBaseEntitlements: state.hasInitializedBaseEntitlements,
    selectedBaseLicenseSlug: state.selectedBaseLicenseSlug,

    initializeBaseEntitlements: actions.initializeBaseEntitlements,
    setSelectedBaseLicenseSlug: actions.setSelectedBaseLicenseSlug,

    store,
  };
}
