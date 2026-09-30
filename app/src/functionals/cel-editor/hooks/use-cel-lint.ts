import { useEffect, useRef, useState } from 'react';
import type { CelIssue, CelLinter } from '../types/cel-context.types';

/** How long the author stops typing before the rule is sent to be checked. */
const DEBOUNCE_MS = 400;

const NO_ISSUES: CelIssue[] = [];

type CelVerdict = {
  // The linter that produced this verdict. `lint` is optional and callers swap
  // it out (an external verdict arrives, validation gets switched off), so a
  // verdict from a different linter describes a check nobody is asking for now.
  linter: CelLinter | undefined;
  issues: CelIssue[];
  isChecking: boolean;
};

const NO_VERDICT: CelVerdict = {
  linter: undefined,
  issues: NO_ISSUES,
  isChecking: false,
};

/**
 * Runs the authoritative check over a rule as it is written.
 *
 * Debounced, and every run owns an AbortController that the cleanup fires. That
 * is what makes the result safe to trust: a verdict about an older version of
 * the text can never arrive last and overwrite a newer one, because the effect
 * that requested it has already aborted its own signal by then.
 *
 * `isChecking` deliberately stays true across an abort: the aborted run is
 * immediately superseded by a run for the newer text, and the truthful reading
 * over the whole stretch of typing is "still checking", not a flicker of done
 * between keystrokes.
 *
 * `lint` must be referentially stable — it is an effect dependency, and a new
 * function on every render would re-check the rule on every render.
 */
export function useCelLint(
  value: string,
  lint?: CelLinter,
): { issues: CelIssue[]; isChecking: boolean } {
  const [verdict, setVerdict] = useState<CelVerdict>(NO_VERDICT);
  const initialValueRef = useRef(value);
  const editedRef = useRef(false);

  useEffect(() => {
    if (value !== initialValueRef.current) {
      editedRef.current = true;
    }

    if (!lint) {
      return;
    }

    // A pristine empty editor is a form the author has not started, not a
    // mistake they have made: opening it under a red marker saying the rule
    // is empty would be scolding them for arriving. The verdict is real —
    // it appears the moment they have typed anything, including typing and
    // then deleting everything, where "empty never matches, write `true`"
    // is exactly what they need to hear.
    //
    // Nothing to clear on the way out: this branch is only reachable while the
    // editor has never been edited, so no verdict has ever been recorded.
    if (!editedRef.current && value.trim() === '') {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      // The markers from the previous run stay up while this one is in flight,
      // per the note above about not flickering — but only if they came from
      // this same linter.
      setVerdict((previous) => ({
        linter: lint,
        issues: previous.linter === lint ? previous.issues : NO_ISSUES,
        isChecking: true,
      }));

      lint(value, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setVerdict({ linter: lint, issues: next, isChecking: false });
          }
        })
        .catch(() => {
          // Unreachable, or refused. "I could not check this" is not the same
          // as "this is fine", but it is also not a set of positions: the
          // markers still on screen belong to text that has since changed, so
          // they go rather than linger somewhere they no longer point at.
          if (!controller.signal.aborted) {
            setVerdict({ linter: lint, issues: NO_ISSUES, isChecking: false });
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, lint]);

  // Derived rather than written back from the effect: with no linter there is
  // no verdict to report, and one recorded under a different linter no longer
  // applies. Clearing those from the effect would only buy a second render.
  const applies = lint !== undefined && verdict.linter === lint;

  return {
    issues: applies ? verdict.issues : NO_ISSUES,
    isChecking: applies ? verdict.isChecking : false,
  };
}
