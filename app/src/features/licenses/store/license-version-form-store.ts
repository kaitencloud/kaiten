import { Store } from '@tanstack/react-store';

export type LicenseVersionFormStoreState = {
  hasInitializedBaseEntitlements: boolean;
  selectedBaseLicenseSlug: string;
};

export type LicenseVersionFormStoreActions = {
  initializeBaseEntitlements: (baseLicenseSlug: string) => void;
  setSelectedBaseLicenseSlug: (slug: string) => void;
};

export function createLicenseVersionFormStore(initialBaseLicenseSlug = '') {
  const store = new Store<LicenseVersionFormStoreState>({
    hasInitializedBaseEntitlements: false,
    selectedBaseLicenseSlug: initialBaseLicenseSlug,
  });

  const actions: LicenseVersionFormStoreActions = {
    initializeBaseEntitlements: (baseLicenseSlug: string) => {
      store.setState((state) => ({
        ...state,
        hasInitializedBaseEntitlements: true,
        selectedBaseLicenseSlug: baseLicenseSlug,
      }));
    },

    setSelectedBaseLicenseSlug: (slug: string) => {
      store.setState((state) => ({
        ...state,
        selectedBaseLicenseSlug: slug,
      }));
    },
  };

  return { store, actions };
}

export type LicenseVersionFormStore = ReturnType<
  typeof createLicenseVersionFormStore
>;
