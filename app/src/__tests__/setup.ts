import '@testing-library/jest-dom';
import { act, cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vite-plus/test';
import './test-i18n';

// Every form field is code-split (see src/hooks/form.ts), so the first
// `findBy*` of a cold run waits on a dynamic import while Vite is still
// transforming and, after a lockfile change, re-optimising dependencies.
// Testing Library allows 1s for that by default -- far under the 10s
// `testTimeout` -- which is what made those queries fail on a cold run and
// pass on every warm one after it.
configure({ asyncUtilTimeout: 5_000 });

// Base UI's inset thumbs require layout measurements, absent in jsdom.
if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) {
  // Base UI defers thumb registration/measurement to a microtask. Finish that
  // React work before unmounting a synchronous render-only test.
  afterEach(async () => {
    await act(async () => {});
    cleanup();
  });
  const original = HTMLElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute('data-base-ui-slider-control'))
          return DOMRect.fromRect({ width: 200, height: 16 });
        if (this.dataset.slot === 'slider-thumb')
          return DOMRect.fromRect({ width: 16, height: 16 });
        return original.call(this);
      },
    );
  });
}

// Mock ResizeObserver (works in both Node and Browser)
if (typeof globalThis.ResizeObserver === 'undefined')
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

// jsdom has no Web Animations API. Base UI's ScrollArea asks its viewport which
// animations run under it, to measure its thumb once they are over: with none, it
// has nothing to wait for. Base UI also waits for the animations of an overlay to
// end before it unmounts it, and only when `getAnimations` exists; with the stub
// in place it would wait on a promise and a test that closes a dialog and looks at
// once would still find it, so its own switch for tests keeps the unmounting
// synchronous, as it is without the method.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.getAnimations !== 'function'
) {
  Element.prototype.getAnimations = () => [];
  (
    globalThis as typeof globalThis & { BASE_UI_ANIMATIONS_DISABLED?: boolean }
  ).BASE_UI_ANIMATIONS_DISABLED = true;
}
