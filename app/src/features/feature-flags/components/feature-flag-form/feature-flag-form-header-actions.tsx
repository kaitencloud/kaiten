import { Button } from '@/components/ui/button';
import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { useFeatureFlagForm } from '../../hooks/use-feature-flag-form';
import type { FeatureFlagFormValues } from '../../types';
import {
  getFeatureFlagSubmitBlockers,
  type TranslateFn,
} from './feature-flag-submit-blockers';

type FeatureFlagFormApi = ReturnType<typeof useFeatureFlagForm>['form'];

type FeatureFlagFormHeaderSubscribeState = {
  disabled: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  values: FeatureFlagFormValues;
};

function SubmitBlockersTooltip({
  children,
  reasons,
  title,
}: {
  children: ReactNode;
  reasons: string[];
  title: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent align="end" side="bottom" className="max-w-sm px-3 py-2">
        <div className="space-y-2">
          <p className="font-medium">{title}</p>
          <ul className="list-disc space-y-1 pl-4">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function FeatureFlagFormHeaderActions({
  form,
  handleCancel,
  isEditMode,
  submitLabel,
  t,
}: {
  form: FeatureFlagFormApi;
  handleCancel: () => void;
  isEditMode: boolean;
  submitLabel: string;
  t: TranslateFn;
}) {
  return (
    <form.Subscribe<FeatureFlagFormHeaderSubscribeState>
      selector={(state) => ({
        disabled:
          state.isValidating ||
          !state.isValid ||
          !state.isDirty ||
          state.isSubmitting,
        isDirty: state.isDirty,
        isSubmitting: state.isSubmitting,
        isValid: state.isValid,
        isValidating: state.isValidating,
        values: state.values,
      })}
    >
      {({ disabled, isDirty, isSubmitting, isValid, isValidating, values }) => {
        const submitBlockers = disabled
          ? getFeatureFlagSubmitBlockers({
              isDirty,
              isEditMode,
              isSubmitting,
              isValid,
              isValidating,
              t,
              values,
            })
          : [];
        const submitBlockersTitle = t(
          'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.title',
        );
        const disabledSubmitButton = (
          <span className="inline-flex">
            <Button type="submit" disabled>
              {isSubmitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          </span>
        );

        return (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t('Common.cancel')}
            </Button>

            {disabled ? (
              <SubmitBlockersTooltip
                reasons={submitBlockers}
                title={submitBlockersTitle}
              >
                {disabledSubmitButton}
              </SubmitBlockersTooltip>
            ) : (
              <Button type="submit">{submitLabel}</Button>
            )}
          </div>
        );
      }}
    </form.Subscribe>
  );
}
