import { useRouter } from '@tanstack/react-router';
import { type RefObject, useEffect, useRef } from 'react';

/**
 * Whether the panel of the page is open on top of an entry of the history that is the page
 * itself, without the panel: it was opened from the page (a click on the row or on its
 * link), and closing it is going back. A panel that came with the address (a link, a
 * reload) has no such entry below it, and closing it replaces its own. The router tells each
 * navigation, so the answer follows the back and forward buttons as well.
 */
export function usePanelOpenedHere(param: string): RefObject<boolean> {
  const router = useRouter();
  const openedHere = useRef(false);

  useEffect(
    () =>
      router.subscribe('onResolved', ({ fromLocation, toLocation }) => {
        const search = (location: typeof toLocation) =>
          location.search as Record<string, unknown>;

        openedHere.current =
          Boolean(search(toLocation)[param]) &&
          fromLocation !== undefined &&
          fromLocation.pathname === toLocation.pathname &&
          !search(fromLocation)[param];
      }),
    [param, router],
  );

  return openedHere;
}
