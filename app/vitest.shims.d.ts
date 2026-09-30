/// <reference types="vite-plus/test/browser/providers/playwright" />

// Vitest 5 reads custom matcher types from `Matchers<R, T>` only. jest-dom 7.0.1
// still augments Vitest 4's one-parameter `Assertion<T>` (and, from the root entry
// src/__tests__/setup.ts imports, `jest.Matchers`, which Vitest 5 ignores), so its
// matchers would lose their types. Drop this block once jest-dom ships Vitest 5
// types (testing-library/jest-dom#738) and import '@testing-library/jest-dom/vitest'
// in the setup file instead.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
