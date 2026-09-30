import { useEffect } from 'react';

/**
 * Bridge component that notifies parent of form state changes via useEffect.
 * Used inside form.Subscribe to convert reactive form state into a callback.
 *
 * Usage:
 * ```tsx
 * <form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, ... })}>
 *   {(state) => <FormStateBridge {...state} onChange={onFormStateChange} />}
 * </form.Subscribe>
 * ```
 */
export function FormStateBridge({
  canSubmit,
  isSubmitting,
  isPristine = true,
  isValidating = false,
  onChange,
}: {
  canSubmit: boolean;
  isSubmitting: boolean;
  isPristine?: boolean;
  /**
   * Whether an async validator is still deciding. A submit button gated only
   * on canSubmit would enable during the debounce window, before a verdict
   * that may say no has landed.
   */
  isValidating?: boolean;
  onChange: (state: {
    canSubmit: boolean;
    isSubmitting: boolean;
    isPristine: boolean;
    isValidating: boolean;
  }) => void;
}) {
  useEffect(() => {
    onChange({ canSubmit, isSubmitting, isPristine, isValidating });
  }, [canSubmit, isSubmitting, isPristine, isValidating, onChange]);
  return null;
}
