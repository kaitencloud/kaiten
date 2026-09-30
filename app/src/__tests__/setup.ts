import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import './test-i18n';

// Every form field is code-split (see src/hooks/form.ts), so the first
// `findBy*` of a cold run waits on a dynamic import while Vite is still
// transforming and, after a lockfile change, re-optimising dependencies.
// Testing Library allows 1s for that by default -- far under the 10s
// `testTimeout` -- which is what made those queries fail on a cold run and
// pass on every warm one after it.
configure({ asyncUtilTimeout: 5_000 });

// Mock ResizeObserver (works in both Node and Browser)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
