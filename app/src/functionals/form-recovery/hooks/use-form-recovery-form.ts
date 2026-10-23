import { useCallback, useEffect, useRef, useState } from 'react';
import {
  encodePayload,
  FormRecoverySerializationError,
} from '@/lib/form-recovery';
import { logger } from '@/lib/logger';
import { buildSnapshot } from '../logic/snapshot';
import {
  cloneValue,
  getAtPath,
  isEqualValue,
  isFilled,
  splitPath,
} from '../logic/values';
import type { FormRecovery, FormRecoveryRestored } from '../types';

/**
 * The part of the TanStack Form `FormApi` the adapter uses. Methods, not
 * properties: their parameters are checked loosely, as the real ones are
 * generic over the paths of the values.
 */
export type FormRecoveryFormApi<TValues> = {
  store: {
    subscribe: (listener: () => void) => { unsubscribe: () => void };
  };
  readonly state: { values: TValues; isSubmitSuccessful: boolean };
  reset(values?: TValues, options?: { keepDefaultValues?: boolean }): void;
  setFieldMeta(field: any, updater: any): void;
  setFieldValue(field: any, value: any): void;
  validate(cause: any): unknown;
};

export type FormRecoveryProgress<TRefs, TExtra> = {
  stepIndex?: number;
  furthestIndex?: number;
  /** Reads the state outside the form that is written with the values. */
  extra?: () => TExtra;
  /** Today's data for reconcile, labels and omitWhen; an absent list is not loaded yet. */
  references?: Partial<TRefs>;
  /** False while the feature itself initializes values or `extra` after the mount. */
  ready?: boolean;
  /** `extra` was dropped because what it was copied from changed: start it afresh. */
  onExtraDiscarded?: () => void;
};

const FOCUS_ATTEMPTS_MS = [0, 50, 250];
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="combobox"]';

/**
 * Meta of a field restored by "Resume": touched and dirty, so that the submit
 * button is enabled and the form knows it differs from its initial values. The
 * updater is whole: `prev` is undefined for a field of a step never shown, and
 * the default meta of TanStack Form is not exported. A field mounted later
 * takes this meta and keeps it.
 */
function restoredMeta(previous: Record<string, unknown> | undefined) {
  return {
    isValidating: false,
    isBlurred: false,
    errorMap: {},
    errorSourceMap: {},
    ...previous,
    isTouched: true,
    isDirty: true,
  };
}

function restoreInto<TValues extends object, TExtra>(
  form: FormRecoveryFormApi<TValues>,
  pristine: TValues,
  restored: FormRecoveryRestored<TValues, TExtra>,
) {
  // `keepDefaultValues`: the real defaults stay, so that a close prompt still
  // sees a form that differs from its initial values and a plain reset works.
  form.reset(restored.values, { keepDefaultValues: true });
  for (const key of Object.keys(restored.values)) {
    const differs = !isEqualValue(
      (restored.values as Record<string, unknown>)[key],
      (pristine as Record<string, unknown>)[key],
    );
    if (differs) form.setFieldMeta(key, restoredMeta);
  }
}

/** The state outside the form, encoded; null when there is none or it cannot be. */
function extraFingerprint(extra: (() => unknown) | undefined): string | null {
  if (!extra) return null;
  try {
    return encodePayload(extra());
  } catch {
    return null;
  }
}

function focusTarget(root: HTMLElement | null): boolean {
  if (!root) return false;
  const target =
    root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    root.querySelector<HTMLElement>(FIELD_SELECTOR);
  target?.focus();
  return target !== null;
}

/**
 * The adapter of TanStack Form, mounted inside the subtree that `sessionKey`
 * mounts again. It restores once, before the first paint; writes as the person
 * types (through the session, which debounces); moves the focus after
 * "Resume" or "Start over"; replays `reconcile` as each list of references
 * arrives; and follows the never-kept fields until they are filled in again.
 *
 * Nothing happens on a form that is not recovered (an edit form).
 */
export function useFormRecoveryForm<
  TValues extends object,
  TRefs = void,
  TExtra = never,
>(
  recovery: FormRecovery<TValues, TExtra>,
  form: FormRecoveryFormApi<TValues>,
  progress: FormRecoveryProgress<TRefs, TExtra> = {},
): { focusRef: (element: HTMLElement | null) => void } {
  const active = recovery.persistent;
  const { restored } = recovery;
  const ready = progress.ready ?? true;

  const recoveryRef = useRef(recovery);
  const progressRef = useRef(progress);
  useEffect(() => {
    recoveryRef.current = recovery;
    progressRef.current = progress;
  });

  // Once, in the initializer, before the first paint: no flicker, and nothing
  // listens to the form yet to be told of the reset.
  const [epoch] = useState(() => {
    if (active && restored) restoreInto(form, recovery.pristine, restored);
    return recovery.internals.epoch();
  });
  const reference = useRef({
    values: recovery.pristine as unknown,
    extra:
      restored?.extra === undefined ? { value: progress.extra?.() } : undefined,
    ready,
  });

  const report = useCallback(
    (immediate: boolean) => {
      const current = recoveryRef.current;
      const live = progressRef.current;
      if (!reference.current.ready) return;

      const { values } = form.state;
      const filled = current.notices
        .filter((notice) => notice.kind === 'omitted')
        .flatMap((notice) => notice.paths)
        .filter((path) => isFilled(getAtPath(values, splitPath(path))));
      if (filled.length > 0) current.internals.clearOmitted(filled);

      try {
        current.internals.track(
          buildSnapshot({
            descriptor: current.internals.descriptor,
            values,
            reference: reference.current.values,
            extra: live.extra?.(),
            extraReference: reference.current.extra,
            references: (live.references ?? {}) as Record<string, unknown>,
            steps: current.internals.steps,
            stepIndex: live.stepIndex ?? 0,
            furthestIndex: live.furthestIndex ?? live.stepIndex ?? 0,
          }),
          immediate,
          epoch,
        );
      } catch (error) {
        if (!(error instanceof FormRecoverySerializationError)) throw error;
        logger.warn('A value of a form cannot be kept: omit its path', {
          formId: current.internals.descriptor.formId,
          path: error.path,
        });
      }
    },
    [form, epoch],
  );

  // The reference moves to where the form stands when the feature has finished
  // its own initialization: what it set up does not count as typed.
  useEffect(() => {
    if (!ready || reference.current.ready) return;
    reference.current = {
      values: cloneValue(form.state.values),
      extra: { value: progressRef.current.extra?.() },
      ready: true,
    };
    report(false);
  }, [ready, form, report]);

  useEffect(() => {
    if (!active) return;
    const subscription = form.store.subscribe(() => report(false));
    report(false);

    return () => {
      subscription.unsubscribe();
      recoveryRef.current.internals.flushOnUnmount(epoch);
      const { writer } = recoveryRef.current;
      if (
        import.meta.env.DEV &&
        form.state.isSubmitSuccessful &&
        (writer.status === 'dirty' || writer.status === 'saved')
      ) {
        logger.warn(
          'A recovered form was submitted without going through send',
          {
            formId: recoveryRef.current.internals.descriptor.formId,
          },
        );
      }
    };
  }, [active, form, report, epoch]);

  const stepIndex = progress.stepIndex;
  const furthestIndex = progress.furthestIndex;
  useEffect(() => {
    if (active) report(true);
  }, [active, stepIndex, furthestIndex, report]);

  // The state outside the form moves without the form's store knowing: the
  // feature re-renders, and its new value is what this effect looks at.
  const extraKey = extraFingerprint(progress.extra);
  useEffect(() => {
    if (active && extraKey !== null) report(false);
  }, [active, extraKey, report]);

  useEffect(() => {
    if (active && restored) void form.validate('change');
  }, [active, form]);

  // Replays reconcile as each list arrives: the loader of a form does not wait
  // for its references, and some are read only once the values are restored.
  const presentLists = Object.entries(progress.references ?? {})
    .filter(([, list]) => list !== undefined)
    .map(([name]) => name)
    .sort()
    .join('|');
  useEffect(() => {
    const { descriptor } = recoveryRef.current.internals;
    if (!active || !restored || !descriptor.reconcile) return;

    const current = form.state.values as Record<string, unknown>;
    const outcome = descriptor.reconcile(
      form.state.values,
      (progressRef.current.references ?? {}) as never,
    );
    for (const [key, value] of Object.entries(
      outcome.values as Record<string, unknown>,
    )) {
      if (!isEqualValue(current[key], value)) form.setFieldValue(key, value);
    }
    recoveryRef.current.internals.addNotes(outcome.notes);
  }, [active, restored, presentLists, form]);

  // What `extra` was copied from has changed since: it is dropped, and said.
  const extraChecked = useRef(false);
  const currentSource = recovery.internals.descriptor.extraSource?.(
    (progress.references ?? {}) as never,
  );
  useEffect(() => {
    if (
      !active ||
      extraChecked.current ||
      restored?.extra === undefined ||
      currentSource == null
    ) {
      return;
    }
    extraChecked.current = true;
    if (restored.extraSource === currentSource) return;

    const { descriptor } = recoveryRef.current.internals;
    recoveryRef.current.internals.addNotes([
      {
        kind: 'sourceChanged',
        source: descriptor.extraSourceLabel ?? {
          key: 'Functionals.FormRecovery.notes.sourceFallback',
        },
      },
    ]);
    reference.current.extra = undefined;
    progressRef.current.onExtraDiscarded?.();
  }, [active, restored, currentSource]);

  const containerRef = useRef<HTMLElement | null>(null);
  const focusRef = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
  }, []);
  const focusedToken = useRef(0);
  const { focusToken } = recovery.internals;
  useEffect(() => {
    if (!active || focusToken <= focusedToken.current) return;
    focusedToken.current = focusToken;

    // A field may still be on its way (they are code-split): ask again.
    const timers = FOCUS_ATTEMPTS_MS.map((delay) =>
      setTimeout(() => {
        if (
          containerRef.current &&
          !containerRef.current.contains(document.activeElement)
        ) {
          focusTarget(containerRef.current);
        }
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [active, focusToken]);

  return { focusRef };
}
