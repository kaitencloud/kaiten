import { useCallback, useEffect, useRef } from 'react';

type FocusLeaveOptions = {
  /**
   * The elements the control is made of, read each time focus moves: its own
   * and the popups it opens, which sit elsewhere in the DOM. Focus in any of
   * them is still in the control.
   */
  containers: () => Array<Element | null | undefined>;
  /** Called once, as focus has gone from every container. */
  onLeave: () => void;
};

/**
 * Tells when focus leaves a control that is made of several elements, as a
 * `blur` would for one: not when it moves from one part to another, nor into a
 * popup the control opened, and not when a popup that closes hands the focus
 * back to the control. Wire `onFocus` and `onBlur` to the root of the control
 * (React delivers the events of a portaled popup there too), and call `check`
 * when a popup closes. The decision is taken one task later, when focus has
 * settled on the element it is going to.
 */
export function useFocusLeave({ containers, onLeave }: FocusLeaveOptions) {
  const inside = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ containers, onLeave });

  useEffect(() => {
    latest.current = { containers, onLeave };
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  const onFocus = useCallback(() => {
    inside.current = true;
  }, []);

  const check = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const active = document.activeElement;
      if (latest.current.containers().some((root) => root?.contains(active))) {
        inside.current = true;

        return;
      }
      if (inside.current) {
        inside.current = false;
        latest.current.onLeave();
      }
    }, 0);
  }, []);

  return { onFocus, onBlur: check, check };
}
