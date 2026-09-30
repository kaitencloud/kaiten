import { Store } from '@tanstack/react-store';

export type DefaultVariantType =
  | 'basic'
  | 'rollout_date'
  | 'rollout_percentage';

type DefaultVariantConfigStoreState = {
  fallbackVariantName: string;
  hasInitialized: boolean;
  type: DefaultVariantType;
};

export type DefaultVariantConfigStoreActions = {
  markInitialized: () => void;
  setFallbackVariantName: (fallbackVariantName: string) => void;
  setType: (type: DefaultVariantType) => void;
};

export function createDefaultVariantConfigStore(
  initialType: DefaultVariantType,
  initialFallbackVariantName: string,
) {
  const store = new Store<DefaultVariantConfigStoreState>({
    fallbackVariantName: initialFallbackVariantName,
    hasInitialized: false,
    type: initialType,
  });

  const actions: DefaultVariantConfigStoreActions = {
    markInitialized: () => {
      store.setState((state) => ({
        ...state,
        hasInitialized: true,
      }));
    },

    setFallbackVariantName: (fallbackVariantName: string) => {
      store.setState((state) => ({
        ...state,
        fallbackVariantName,
      }));
    },

    setType: (type: DefaultVariantType) => {
      store.setState((state) => ({
        ...state,
        type,
      }));
    },
  };

  return { store, actions };
}

export type DefaultVariantConfigStore = ReturnType<
  typeof createDefaultVariantConfigStore
>;
