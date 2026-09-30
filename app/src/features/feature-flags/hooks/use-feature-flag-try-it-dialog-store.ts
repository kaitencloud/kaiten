import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { createFeatureFlagTryItDialogStore } from '../store';

export function useFeatureFlagTryItDialogStore() {
  const { store, actions } = useMemo(
    () => createFeatureFlagTryItDialogStore(),
    [],
  );
  const state = useStore(store, (snapshot) => snapshot);

  return {
    contextInput: state.contextInput,
    parseError: state.parseError,

    clearParseError: actions.clearParseError,
    setContextInput: actions.setContextInput,
    setParseError: actions.setParseError,

    store,
  };
}
