import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { useReleaseForm } from '../../hooks/use-release-form';
import {
  releaseBaseStepSchema,
  type ReleaseFormValues,
  releaseFormSchema,
  releaseMetadataStepSchema,
} from '../../schemas/release.schema';

export const RELEASE_FORM_STEPS = ['base', 'metadata', 'components'] as const;

export type ReleaseFormStep = (typeof RELEASE_FORM_STEPS)[number];

export type ReleaseFormApi = ReturnType<typeof useReleaseForm>['form'];

export type ReleaseFormHeaderSubscribeState = {
  disabled: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  values: ReleaseFormValues;
};

/**
 * Maps a Zod issue raised by the release schemas to a human-readable,
 * translated reason. Known custom messages are matched explicitly; everything
 * else falls back to a field-based or generic reason.
 */
function translateReleaseIssue(issue: z.ZodIssue, t: TFunction): string {
  switch (issue.message) {
    case 'Select how to create the release':
      return t('Features.Releases.Form.SubmitBlockers.creationModeRequired');
    case 'Select a base release':
      return t('Features.Releases.Form.SubmitBlockers.previousReleaseRequired');
    default:
      break;
  }

  if (issue.path[0] === 'version') {
    return t('Features.Releases.Form.SubmitBlockers.versionRequired');
  }

  return t('Features.Releases.Form.SubmitBlockers.reviewForm');
}

export function getReleaseSubmitBlockers({
  isDirty,
  isLoading,
  isSubmitting,
  isValid,
  isValidating,
  t,
  values,
}: {
  isDirty: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  isValidating: boolean;
  t: TFunction;
  values: ReleaseFormValues;
}) {
  const reasons = new Set<string>();

  if (isSubmitting || isLoading) {
    reasons.add(
      t('Features.Releases.Form.SubmitBlockers.submissionInProgress'),
    );
  }

  if (isValidating) {
    reasons.add(
      t('Features.Releases.Form.SubmitBlockers.validationInProgress'),
    );
  }

  if (!isDirty) {
    reasons.add(t('Features.Releases.Form.SubmitBlockers.noChanges'));
  }

  const validationResult = releaseFormSchema.safeParse(values);

  if (!validationResult.success) {
    for (const issue of validationResult.error.issues) {
      reasons.add(translateReleaseIssue(issue, t));
    }
  }

  if (!isValid && reasons.size === 0) {
    reasons.add(t('Features.Releases.Form.SubmitBlockers.reviewForm'));
  }

  return Array.from(reasons);
}

function getStepSchema(step: ReleaseFormStep) {
  switch (step) {
    case 'base':
      return releaseBaseStepSchema;
    case 'metadata':
      return releaseMetadataStepSchema;
    case 'components':
      return null;
  }
}

/**
 * Returns the list of human-readable reasons preventing the user from leaving
 * the given step. An empty list means the step is valid and the user can move
 * on to the next one.
 */
export function getStepBlockers(
  step: ReleaseFormStep,
  values: ReleaseFormValues,
  t: TFunction,
) {
  const schema = getStepSchema(step);

  if (!schema) {
    return [];
  }

  const result = schema.safeParse(values);

  if (result.success) {
    return [];
  }

  const reasons = new Set<string>();

  for (const issue of result.error.issues) {
    reasons.add(translateReleaseIssue(issue, t));
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
