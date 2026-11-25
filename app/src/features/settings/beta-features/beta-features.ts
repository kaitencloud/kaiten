import type { ApiScope, ApiScopeResource } from '@/lib/api/scopes.gen';
import { isApiError } from '@/lib/errors';
import type { PlatformFlagEvaluation } from '@/lib/platform-flag-evaluations';
import type { BetaFeature, BetaFeatureProblem, BetaStage } from './types';

/**
 * The scope a toggle needs; every member may read the page. Spelled from the
 * generated scope tables, which saas-api enforces and no Core operation uses,
 * so that a renamed scope fails the type check here.
 */
const BETA_FEATURES_SCOPE_RESOURCE: ApiScopeResource = 'beta_features';
export const WRITE_BETA_FEATURES_SCOPE: ApiScope = `write:${BETA_FEATURES_SCOPE_RESOURCE}`;

const LISTED_STAGES: readonly BetaStage[] = ['public_beta', 'open_beta'];

function listedStage(stage: unknown): BetaStage | null {
  return LISTED_STAGES.find((listed) => listed === stage) ?? null;
}

/**
 * Whether the organization is in the beta, read off its flag's evaluation: the
 * value of a boolean flag, and for any other type whether the variant served
 * is the one the flag's metadata names `betaVariant`. The type is the value's,
 * as the evaluation answered it. A non-boolean flag that names no
 * `betaVariant` is never on, since nothing says which variant is the beta.
 */
export function isInBeta(evaluation: PlatformFlagEvaluation): boolean {
  if (evaluation.type === 'boolean') {
    return evaluation.value === true;
  }

  const betaVariant = evaluation.metadata.betaVariant;

  return (
    typeof betaVariant === 'string' &&
    betaVariant !== '' &&
    evaluation.variant === betaVariant
  );
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Code-unit order: the same in every language and every browser. */
function bySlug(a: BetaFeature, b: BetaFeature): number {
  if (a.flagSlug === b.flagSlug) {
    return 0;
  }
  return a.flagSlug < b.flagSlug ? -1 : 1;
}

/**
 * The betas the page lists: every flag of the bulk evaluation whose metadata
 * `stage` is `public_beta` or `open_beta`, whether or not the console knows its
 * name. A flag with no stage is released or not a beta, and a `private_beta` is
 * the vendor's to open; neither is listed. Nor is a flag the service reported in
 * error, whose state the page could not tell.
 *
 * Ordered by slug, since the evaluation comes in no guaranteed order: a title
 * would sort differently in each language, and change order when its
 * translation ships.
 */
export function betaFeaturesOf(
  evaluations: readonly PlatformFlagEvaluation[],
): BetaFeature[] {
  return evaluations
    .flatMap((evaluation): BetaFeature[] => {
      const stage = listedStage(evaluation.metadata.stage);
      if (!stage || evaluation.error) {
        return [];
      }

      const metadataTitle = nonEmptyString(evaluation.metadata.title);
      const metadataDescription = nonEmptyString(
        evaluation.metadata.description,
      );

      return [
        {
          flagSlug: evaluation.key,
          stage,
          enabled: isInBeta(evaluation),
          ...(metadataTitle && { metadataTitle }),
          ...(metadataDescription && { metadataDescription }),
        },
      ];
    })
    .sort(bySlug);
}

const PROBLEM_BY_CODE: Readonly<Record<string, BetaFeatureProblem>> = {
  'SetBetaFeature.InvalidBody': 'invalid-body',
  'RequireScope.MissingScope': 'missing-scope',
  'SetBetaFeature.NotToggleable': 'not-toggleable',
  'SetBetaFeature.NotProvisioned': 'not-provisioned',
  'SetBetaFeature.NotAccepted': 'not-accepted',
  'SetBetaFeature.Unavailable': 'unavailable',
};

/** What a refusal of `PUT /beta-features/{flagSlug}` means for the page. */
export function betaFeatureProblem(error: unknown): BetaFeatureProblem {
  if (!isApiError(error)) {
    return 'unexpected';
  }

  const code = (error.data as { code?: unknown } | null | undefined)?.code;
  const known = typeof code === 'string' ? PROBLEM_BY_CODE[code] : undefined;
  if (known) {
    return known;
  }
  if (error.status === 403) {
    return 'missing-scope';
  }
  // No answer at all, or a gateway that could not reach the service.
  if (error.status === undefined || error.status >= 502) {
    return 'unavailable';
  }

  return 'unexpected';
}

/** The refusals a second try may get past without anything else changing. */
export function isRetryable(problem: BetaFeatureProblem): boolean {
  return problem === 'unavailable' || problem === 'not-provisioned';
}
