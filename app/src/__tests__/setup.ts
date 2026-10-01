import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { beforeEach, vi } from 'vite-plus/test';
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
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
