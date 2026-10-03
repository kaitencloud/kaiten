import { HttpResponse } from 'msw/http';
import {
  handleCreateFeatureFlag,
  handleDeleteFeatureFlag,
  handleEvaluateFlag,
  handleGetFeatureFlag,
  handleGetFeatureFlags,
  handleGetTargetingContext,
  handleLintTargetingRule,
  handleUpdateFeatureFlag,
} from '@/api-client/msw.gen';
import type { FeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import { withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const featureFlagHandlers = (
  model: FeatureFlagAppModel,
  persist: PersistMswState = noop,
) => [
  handleGetTargetingContext({ body: { roots: [] } }),
  // This UI suite exercises editing, not the real CEL linter (stack smoke).
  handleLintTargetingRule({ body: { valid: true, issues: [] } }),
  handleGetFeatureFlags(() =>
    HttpResponse.json({ hasMore: false, items: model.listFeatureFlags() }),
  ),
  handleCreateFeatureFlag(
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ request }) => {
        const flag = model.createFeatureFlag(await request.json());
        persist();
        return HttpResponse.json(flag, { status: 201 });
      },
    ),
  ),
  handleGetFeatureFlag(
    withErrorHandling('Unexpected feature flag mock error', ({ params }) =>
      HttpResponse.json(model.getFeatureFlag(params.featureFlagSlug)),
    ),
  ),
  handleUpdateFeatureFlag(
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ params, request }) => {
        const flag = model.updateFeatureFlag(
          params.featureFlagSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(flag);
      },
    ),
  ),
  handleDeleteFeatureFlag(
    withErrorHandling('Unexpected feature flag mock error', ({ params }) => {
      model.deleteFeatureFlag(params.featureFlagSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleEvaluateFlag(
    withErrorHandling(
      'Unexpected feature flag evaluation mock error',
      async ({ params, request }) => {
        const body = await request.json();
        return HttpResponse.json(
          model.evaluateFlag(params.key, body.context ?? {}),
        );
      },
    ),
  ),
];
