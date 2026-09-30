import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  // jsdom has no matchMedia: the snapshot is then simply never invalidated.
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  // Subscribe to the media query directly instead of seeding state from an
  // effect: getSnapshot returns the correct value on the very first render
  // (no undefined → false flash) with no extra render.
  return React.useSyncExternalStore(subscribe, getSnapshot);
}
