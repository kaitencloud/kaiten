import { useState } from 'react';
import { type AttioSetupStore, createAttioSetupStore } from '../store';

/**
 * Creates a stable Attio setup store for the lifetime of the page.
 * `useState` (not `useMemo`) so React guarantees the instance is retained.
 */
export function useAttioSetupStore(): AttioSetupStore {
  return useState(() => createAttioSetupStore())[0];
}
