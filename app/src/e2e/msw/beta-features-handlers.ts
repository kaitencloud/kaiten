import { HttpResponse, http } from 'msw/http';
import { handleEvaluateFlagsBulk } from '@/api-client/msw.gen';
import { decodeGrantedScopes, hasScope } from '@/lib/scope-claims';
import type { BetaFeaturesAppModel } from '../../../e2e/app/_support/model/beta-features-app-model';
import { BETA_FEATURE_REFUSALS } from '../../../e2e/app/_support/model/beta-features-app-model';
import { BillingProblem } from '../../../e2e/app/_support/model/billing-problem';
import { bulkFlagEvaluation } from '../../../e2e/app/_support/model/platform-flags';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

/**
 * The Beta features page: the bulk OFREP evaluation, answering the model's
 * flags with their metadata beside the boolean `flagEvaluations`, read at each
 * request so that a toggle shows on the next read; and saas-api's
 * `PUT /api/beta-features/{flagSlug}`, written by hand since `app/openapi.yaml`
 * does not describe it. The toggle checks the caller's scope from the token, as
 * saas-api's `RequireScope` does, before the model checks the rest.
 */
export const betaFeaturesHandlers = (
  model: BetaFeaturesAppModel,
  flagEvaluations: Record<string, boolean>,
  persist: PersistMswState = noop,
) => [
  handleEvaluateFlagsBulk(() =>
    HttpResponse.json(bulkFlagEvaluation(flagEvaluations, model.evaluations())),
  ),
  http.put<{ flagSlug: string }>(
    '*/api/beta-features/:flagSlug',
    withProblems(async ({ params, request }) => {
      const token = request.headers
        .get('Authorization')
        ?.match(/^Bearer (.+)$/)?.[1];
      if (!hasScope(decodeGrantedScopes(token), 'write:beta_features')) {
        const { code, detail, status } = BETA_FEATURE_REFUSALS.missingScope;
        throw new BillingProblem(status, code, detail);
      }
      const body: unknown = await request.json().catch(() => null);
      const answer = model.setBetaFeature(params.flagSlug, body);
      persist();

      return HttpResponse.json(answer);
    }),
  ),
];
