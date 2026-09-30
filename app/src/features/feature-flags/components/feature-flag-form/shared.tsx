import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { useFeatureFlagForm } from '../../hooks/use-feature-flag-form';
import {
  featureFlagFormSchema,
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
} from '../../schemas/feature-flag.schema';
import type { FeatureFlagFormValues } from '../../types';

export const FEATURE_FLAG_FORM_STEPS = [
  'step1',
  'step2',
  'step3',
  'step4',
] as const;

export type FeatureFlagFormTab = (typeof FEATURE_FLAG_FORM_STEPS)[number];

const FEATURE_FLAG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export type FeatureFlagFormApi = ReturnType<typeof useFeatureFlagForm>['form'];

export type FeatureFlagFormHeaderSubscribeState = {
  disabled: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  values: FeatureFlagFormValues;
};

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function translateFeatureFlagSubmitIssue(
  message: string,
  t: TranslateFn,
) {
  if (message.startsWith('Pages.') || message.startsWith('Features.')) {
    return t(message);
  }

  switch (message) {
    case 'Name is required':
      return t(
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.nameRequired',
      );
    case 'Slug is required':
      return t(
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.slugRequired',
      );
    default:
      return null;
  }
}

export function getFeatureFlagSubmitBlockers({
  isDirty,
  isEditMode,
  isSubmitting,
  isValid,
  isValidating,
  t,
  values,
}: {
  isDirty: boolean;
  isEditMode: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  t: TranslateFn;
  values: FeatureFlagFormValues;
}) {
  const reasons = new Set<string>();

  if (isSubmitting) {
    reasons.add(
      t(
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.submissionInProgress',
      ),
    );
  }

  if (isValidating) {
    reasons.add(
      t(
        'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.validationInProgress',
      ),
    );
  }

  if (!isDirty) {
    reasons.add(
      t(
        isEditMode
          ? 'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.noChangesUpdate'
          : 'Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.noChangesCreate',
      ),
    );
  }

  if (!values.name.trim()) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.nameRequired'),
    );
  }

  if (!values.slug.trim()) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.slugRequired'),
    );
  } else if (
    values.slug.length < 2 ||
    values.slug.length > 100 ||
    !FEATURE_FLAG_SLUG_PATTERN.test(values.slug)
  ) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.slugInvalid'),
    );
  }

  if (!values.variants || values.variants.length === 0) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.Step2.Errors.atLeastOneVariant'),
    );
  } else {
    const hasInvalidVariant = values.variants.some((variant) => {
      if (!variant.name.trim()) {
        return true;
      }

      if (variant.value === undefined || variant.value === null) {
        return true;
      }

      return typeof variant.value === 'string' && variant.value === '';
    });

    if (hasInvalidVariant) {
      reasons.add(
        t(
          'Pages.FeatureFlags.Mutation.Form.Step2.Errors.allVariantsMustBeValid',
        ),
      );
    }
  }

  if (
    values.default_variant.type === 'basic' &&
    !values.default_variant.value
  ) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.Step3.Errors.defaultVariantRequired'),
    );
  }

  const validationResult = featureFlagFormSchema.safeParse(values);

  if (!validationResult.success) {
    for (const issue of validationResult.error.issues) {
      const translatedIssue = translateFeatureFlagSubmitIssue(issue.message, t);

      if (translatedIssue) {
        reasons.add(translatedIssue);
      }
    }
  }

  if (!isValid && reasons.size === 0) {
    reasons.add(
      t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.reviewForm'),
    );
  }

  return Array.from(reasons);
}

function getStepSchema(step: FeatureFlagFormTab) {
  switch (step) {
    case 'step1':
      return step1Schema;
    case 'step2':
      return step2Schema;
    case 'step3':
      return step3Schema;
    case 'step4':
      return step4Schema;
  }
}

/**
 * Returns the list of human-readable reasons preventing the user from leaving
 * the given step. An empty list means the step is valid and the user can move
 * on to the next one.
 */
export function getStepBlockers(
  step: FeatureFlagFormTab,
  values: FeatureFlagFormValues,
  t: TranslateFn,
) {
  const result = getStepSchema(step).safeParse(values);

  if (result.success) {
    return [];
  }

  const reasons = new Set<string>();

  for (const issue of result.error.issues) {
    const translatedIssue = translateFeatureFlagSubmitIssue(issue.message, t);

    reasons.add(
      translatedIssue ??
        t('Pages.FeatureFlags.Mutation.Form.SubmitBlockers.Reasons.reviewForm'),
    );
  }

  return Array.from(reasons);
}

export function SubmitBlockersTooltip({
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
