import { createContext, use } from 'react';
import type { FeatureFlagDetailContextValue } from './types';

export const FeatureFlagDetailContext =
  createContext<FeatureFlagDetailContextValue | null>(null);

export const useFeatureFlagDetailContext = () => {
  const context = use(FeatureFlagDetailContext);

  if (!context) {
    throw new Error('FeatureFlagDetailContext is missing');
  }

  return context;
};
