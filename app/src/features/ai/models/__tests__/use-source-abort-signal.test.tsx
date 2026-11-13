import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';
import { useSourceAbortSignal } from '../use-source-abort-signal';
it('retains a usable request controller after StrictMode setup and aborts on real unmount', () => {
  const { result, unmount } = renderHook(useSourceAbortSignal, { wrapper: StrictMode });
  const signal = result.current.current.signal;
  expect(signal.aborted).toBe(false); unmount(); expect(signal.aborted).toBe(true);
});
