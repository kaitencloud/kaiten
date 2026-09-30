import { useStore } from '@tanstack/react-store';
import { useState } from 'react';
import type { DefaultVariantType } from '../store';
import { createDefaultVariantConfigStore } from '../store';

export function useDefaultVariantConfigStore(
  initialType: DefaultVariantType,
  initialFallbackVariantName: string,
) {
  const [{ store, actions }] = useState(() =>
    createDefaultVariantConfigStore(initialType, initialFallbackVariantName),
  );

  const state = useStore(store, (snapshot) => snapshot);

  return {
    fallbackVariantName: state.fallbackVariantName,
    hasInitialized: state.hasInitialized,
    type: state.type,

    markInitialized: actions.markInitialized,
    setFallbackVariantName: actions.setFallbackVariantName,
    setType: actions.setType,

    store,
  };
}
