import { featureFlagFormSchema } from '../../schemas/feature-flag.schema';
import type { FeatureFlagFormValues } from '../../types';

const FEATURE_FLAG_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function translateFeatureFlagSubmitIssue(message: string, t: TranslateFn) {
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
