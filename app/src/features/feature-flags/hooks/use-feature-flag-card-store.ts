import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { createFeatureFlagCardStore } from '../store';

export function useFeatureFlagCardStore() {
  const { store, actions } = useMemo(() => createFeatureFlagCardStore(), []);
  const state = useStore(store, (snapshot) => snapshot);

  return {
    tryItOpen: state.tryItOpen,
    closeTryIt: actions.closeTryIt,
    openTryIt: actions.openTryIt,
    setTryItOpen: actions.setTryItOpen,
    store,
  };
}
