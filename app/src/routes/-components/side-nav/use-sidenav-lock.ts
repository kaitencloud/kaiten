import * as React from 'react';

// Beyond this viewport width the side navigation is locked open and its toggle
// is hidden. The root layout caps its content at max-w-screen-2xl
// (--breakpoint-2xl = 96rem / 1536px). The threshold is based on the *collapsed*
// rail (--sidebar-width-icon = 4rem / 64px), not the expanded width: once the
// viewport reaches 64 + 1536 = 1600px, the content already hits its max next to
// the collapsed rail, so collapsing the nav would no longer widen the content —
// it would just re-center it and open an empty gap (a shift between the expanded
// and collapsed states). Lock it open instead so that shift can't happen.
const SIDENAV_LOCK_BREAKPOINT = 1600;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(min-width: ${SIDENAV_LOCK_BREAKPOINT}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.innerWidth >= SIDENAV_LOCK_BREAKPOINT;
}

export function useIsSideNavLocked() {
  // Mirror useIsMobile: subscribe to the media query directly so getSnapshot
  // returns the correct value on first render (no flash) with no extra render.
  return React.useSyncExternalStore(subscribe, getSnapshot);
}
