import { useBlocker } from '@tanstack/react-router';
import { useCallback, useRef, useState } from 'react';

/** The part of a location that says which rule form is open. */
type FormLocation = { pathname: string; search: unknown };

const FORM_KEYS = ['cell', 'pool', 'type', 'family'] as const;

/**
 * Whether going from one location to another drops the open rule form: another
 * page, or another cell, pool, request type or family of the rate card. A
 * change of the search box or of the status filter keeps the form.
 */
export function dropsRuleForm(current: FormLocation, next: FormLocation) {
  if (current.pathname !== next.pathname) {
    return true;
  }
  const from = (current.search ?? {}) as Record<string, unknown>;
  const to = (next.search ?? {}) as Record<string, unknown>;

  return FORM_KEYS.some((key) => from[key] !== to[key]);
}

/**
 * Keeps a rule form that has unsent changes from being dropped without a word.
 *
 * - A click in the rate card that would replace the form (another cell, tab,
 *   pool or family, the close button) goes through `run`: it is held until the
 *   person confirms.
 * - Any other navigation that would drop it (the browser's Back and Forward, a
 *   link of the side navigation, a breadcrumb) is stopped by the router's
 *   blocker, and asks the same question.
 * - Closing or reloading the tab asks the browser's own question
 *   (`beforeunload`), the only one a page may ask there.
 */
export function useDirtyGuard() {
  const [dirty, setDirtyState] = useState(false);
  const [held, setHeld] = useState<(() => void) | null>(null);
  // Read by the blocker when a navigation starts, which may be in the same
  // tick as the confirmation that allowed it: refs, not state.
  const dirtyRef = useRef(false);
  const allowed = useRef(false);

  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    if (value) {
      allowed.current = false;
    }
    setDirtyState(value);
  }, []);

  const blocker = useBlocker({
    enableBeforeUnload: () => dirtyRef.current,
    shouldBlockFn: ({ current, next }) =>
      dirtyRef.current && !allowed.current && dropsRuleForm(current, next),
    withResolver: true,
  });

  const run = useCallback(
    (action: () => void) => {
      if (dirty) {
        setHeld(() => action);
      } else {
        action();
      }
    },
    [dirty],
  );
  /** Runs what leaves the form without asking: the form's own Cancel. */
  const discard = useCallback(
    (action: () => void) => {
      allowed.current = true;
      setDirty(false);
      action();
    },
    [setDirty],
  );
  const confirm = useCallback(() => {
    if (blocker.status === 'blocked') {
      blocker.proceed();
    }
    if (held) {
      allowed.current = true;
      held();
    }
    setDirty(false);
    setHeld(null);
  }, [blocker, held, setDirty]);
  const cancel = useCallback(() => {
    if (blocker.status === 'blocked') {
      blocker.reset();
    }
    setHeld(null);
  }, [blocker]);

  return {
    asking: held !== null || blocker.status === 'blocked',
    cancel,
    confirm,
    discard,
    run,
    setDirty,
  };
}
