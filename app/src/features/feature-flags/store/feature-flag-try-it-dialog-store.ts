import { Store } from '@tanstack/react-store';

const DEFAULT_CONTEXT_INPUT = '{\n  "targetingKey": "user-123"\n}';

type FeatureFlagTryItDialogStoreState = {
  contextInput: string;
  parseError: string;
};

export type FeatureFlagTryItDialogStoreActions = {
  clearParseError: () => void;
  setContextInput: (input: string) => void;
  setParseError: (error: string) => void;
};

export function createFeatureFlagTryItDialogStore() {
  const store = new Store<FeatureFlagTryItDialogStoreState>({
    contextInput: DEFAULT_CONTEXT_INPUT,
    parseError: '',
  });

  const actions: FeatureFlagTryItDialogStoreActions = {
    clearParseError: () => {
      store.setState((state) => ({
        ...state,
        parseError: '',
      }));
    },

    setContextInput: (input: string) => {
      store.setState((state) => ({
        ...state,
        contextInput: input,
      }));
    },

    setParseError: (error: string) => {
      store.setState((state) => ({
        ...state,
        parseError: error,
      }));
    },
  };

  return { store, actions };
}

export { DEFAULT_CONTEXT_INPUT };
export type FeatureFlagTryItDialogStore = ReturnType<
  typeof createFeatureFlagTryItDialogStore
>;
