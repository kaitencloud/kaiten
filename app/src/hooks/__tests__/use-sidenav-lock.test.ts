import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { useIsSideNavLocked } from '../use-sidenav-lock';

const originalInnerWidth = window.innerWidth;
const originalMatchMedia = window.matchMedia;

function mockViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: width >= 1600,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: originalInnerWidth,
  });
  window.matchMedia = originalMatchMedia;
});

describe('useIsSideNavLocked', () => {
  it('locks the nav once collapsing it would only re-center the content (>= 1600px)', () => {
    mockViewport(1600);
    const { result } = renderHook(() => useIsSideNavLocked());
    expect(result.current).toBe(true);
  });

  it('keeps the nav toggleable while collapsing still widens the content (< 1600px)', () => {
    mockViewport(1599);
    const { result } = renderHook(() => useIsSideNavLocked());
    expect(result.current).toBe(false);
  });
});
