import { type AnyFormApi, useStore } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Voucher } from '@/api-client';
import {
  createVoucherMutation,
  publishVoucherMutation,
  updateVoucherMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  clearProblemFieldError,
  invalidateVoucherQueries,
  setProblemFieldError,
} from '@/domains/billing';
import { useAppForm } from '@/hooks/form';
import {
  type AskingStep,
  getStepErrors,
  getVoucherFormErrors,
  getVoucherRefusalTarget,
  initialVoucherFormValues,
  VOUCHER_STEPS,
  type VoucherFormValues,
  voucherFormValuesToBody,
  voucherToFormValues,
} from '../schemas';

/** What the wizard does with the voucher it sends: publishes it, or keeps it as a draft. */
export type VoucherSubmitIntent = 'draft' | 'publish';

type UseVoucherFormOptions = {
  /** The draft being edited in the wizard that made it; a new voucher when left out. */
  draft?: Voucher;
  /** Where a new voucher starts, and the step it starts on. */
  start?: { step: number; values: VoucherFormValues };
  /** Called with the voucher once it is kept as a draft, for the page to go to it. */
  onDraftSaved?: (voucher: Voucher) => void;
};

/** TanStack Form reads a form-level check as `{ fields }`, each field with its message. */
const toFieldErrors = (errors: Record<string, string> | undefined) =>
  errors
    ? {
        fields: Object.fromEntries(
          Object.entries(errors).map(([field, message]) => [
            field,
            { message },
          ]),
        ),
      }
    : undefined;

/**
 * The form of the wizard that makes a voucher, in four steps, and what it sends. Leaving
 * a step needs it to be valid; its fields show their messages once the person has been
 * to them, and an attempt to leave a step that is not valid shows them all. The last
 * step publishes: it sends the voucher, then publishes it (`POST /vouchers`, then
 * `POST /vouchers/{id}/publish`). The two are not one request, so the voucher exists
 * as a draft the moment the first is accepted; if the second is refused, the draft is
 * kept (`saved`) and sending again replaces it with what the form holds now and
 * publishes it, never making a second voucher with the same code. A billing write is
 * never optimistic: the page shows the voucher once the API has accepted it.
 *
 * A refusal about one field is shown on it, in the API's words, and the wizard goes
 * back to the step that has it; any other is returned as the failure, to show above
 * the buttons.
 */
export function useVoucherForm({
  draft,
  onDraftSaved,
  start,
}: UseVoucherFormOptions = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initialStep = start?.step ?? (draft ? VOUCHER_STEPS.length - 1 : 0);
  const [step, setStep] = useState(initialStep);
  const [furthest, setFurthest] = useState(initialStep);
  const [saved, setSaved] = useState<Voucher | null>(draft ?? null);
  const [published, setPublished] = useState<Voucher | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const intent = useRef<VoucherSubmitIntent>('publish');
  // The field the API refused something about: a refusal that is about several fields
  // together (a short code that nothing bounds) is fixed by changing another, so it is
  // taken off at the first change of any, and the API is asked again.
  const refused = useRef<string | null>(null);
  const stepRef = useRef(initialStep);
  const busy = useRef(false);
  const create = useMutation(createVoucherMutation());
  const update = useMutation(updateVoucherMutation());
  const publish = useMutation(publishVoucherMutation());

  function moveTo(index: number) {
    stepRef.current = index;
    setStep(index);
    setFurthest((previous) => Math.max(previous, index));
  }

  const form = useAppForm({
    defaultValues: draft
      ? voucherToFormValues(draft)
      : (start?.values ?? initialVoucherFormValues),
    onSubmit: async ({ formApi, value }) => {
      // Enter in a field of an earlier step is not a request to publish.
      if (VOUCHER_STEPS[stepRef.current] !== 'review' || busy.current) {
        return;
      }
      busy.current = true;
      setFailure(null);
      try {
        const body = voucherFormValuesToBody(value);
        const stored = saved
          ? await update.mutateAsync({ body, path: { voucherId: saved.id } })
          : await create.mutateAsync({ body });
        setSaved(stored);
        if (intent.current === 'draft') {
          await invalidateVoucherQueries(queryClient, stored.id);
          toast.success(t('Pages.Vouchers.Wizard.Toasts.draftSaved'));
          onDraftSaved?.(stored);

          return;
        }
        const live = await publish.mutateAsync({
          path: { voucherId: stored.id },
        });
        setSaved(live);
        setPublished(live);
        await invalidateVoucherQueries(queryClient, live.id);
        toast.success(t('Pages.Vouchers.Wizard.Toasts.published'));
      } catch (error) {
        const target = getVoucherRefusalTarget(error, value);

        if (target) {
          setProblemFieldError(formApi, target.field, target.message);
          refused.current = target.field;
          moveTo(VOUCHER_STEPS.indexOf(target.step));
        } else {
          setFailure(error);
        }
        if (saved === null) {
          // A voucher made before the refusal exists as a draft: the lists know it.
          await invalidateVoucherQueries(queryClient);
        }
      } finally {
        busy.current = false;
      }
    },
    listeners: {
      onChange: ({ formApi }) => {
        if (refused.current !== null) {
          clearProblemFieldError(formApi, refused.current);
          refused.current = null;
        }
      },
    },
    // A voucher that is not valid is never sent; the wizard then goes to the first step
    // that has something to fix, whichever step the person asked from.
    onSubmitInvalid: ({ value }) => {
      for (const [at, name] of VOUCHER_STEPS.entries()) {
        if (name !== 'review' && showErrors(name, value)) {
          moveTo(at);

          return;
        }
      }
    },
    validators: {
      onChange: ({ value }) => toFieldErrors(getVoucherFormErrors(value)),
    },
  });

  /**
   * Marks the fields of a step that have something to fix as visited, so that they say what;
   * whether there were any. The checks of the form run when a field changes, and a step that
   * was never touched has had none run: they are run here, so that what is wrong is there to say.
   */
  function showErrors(name: AskingStep, values: VoucherFormValues): boolean {
    const fields = Object.keys(getStepErrors(name, values));

    if (fields.length > 0) {
      void form.validate('change');
    }
    for (const field of fields) {
      (form as AnyFormApi).setFieldMeta(field, (meta) => ({
        ...meta,
        isTouched: true,
      }));
    }

    return fields.length > 0;
  }

  /** Goes to the next step when the current one is valid; otherwise shows what is wrong with it. */
  function next() {
    const name = VOUCHER_STEPS[stepRef.current];

    if (name === 'review' || showErrors(name, form.state.values)) {
      return;
    }
    moveTo(stepRef.current + 1);
  }

  /**
   * Goes back, or to a step already reached; a step beyond the furthest is not
   * reachable. Going forward passes through the steps in between, and stops at the first
   * one that has something to fix: a step that was reached and then broken is not skipped.
   */
  function goTo(index: number) {
    if (index < 0 || index > Math.max(furthest, stepRef.current)) {
      return;
    }
    for (let at = stepRef.current; at < index; at += 1) {
      const name = VOUCHER_STEPS[at];

      if (name !== 'review' && showErrors(name, form.state.values)) {
        moveTo(at);

        return;
      }
    }
    moveTo(index);
  }

  function submit(next: VoucherSubmitIntent) {
    intent.current = next;
    void form.handleSubmit();
  }

  /** Sends again what was last asked for, after a failure that changed nothing. */
  function retry() {
    void form.handleSubmit();
  }

  /** Starts over with an empty voucher, from the first step, once the one just made has been shown. */
  function restart() {
    form.reset(initialVoucherFormValues);
    stepRef.current = 0;
    setStep(0);
    setFurthest(0);
    setSaved(null);
    setPublished(null);
    setFailure(null);
  }

  const submitting = useStore(form.store, (state) => state.isSubmitting);

  return {
    failure,
    form,
    furthest,
    goTo,
    next,
    published,
    restart,
    retry,
    saved,
    step,
    submit,
    submitting,
  };
}
