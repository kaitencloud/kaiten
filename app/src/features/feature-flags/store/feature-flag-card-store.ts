import { Store } from '@tanstack/react-store';

type FeatureFlagCardStoreState = {
  tryItOpen: boolean;
};

export type FeatureFlagCardStoreActions = {
  closeTryIt: () => void;
  openTryIt: () => void;
  setTryItOpen: (open: boolean) => void;
};

export function createFeatureFlagCardStore() {
  const store = new Store<FeatureFlagCardStoreState>({
    tryItOpen: false,
  });

  const actions: FeatureFlagCardStoreActions = {
    closeTryIt: () => {
      store.setState((state) => ({
        ...state,
        tryItOpen: false,
      }));
    },

    openTryIt: () => {
      store.setState((state) => ({
        ...state,
        tryItOpen: true,
      }));
    },

    setTryItOpen: (open: boolean) => {
      store.setState((state) => ({
        ...state,
        tryItOpen: open,
      }));
    },
  };

  return { store, actions };
}

export type FeatureFlagCardStore = ReturnType<
  typeof createFeatureFlagCardStore
>;
