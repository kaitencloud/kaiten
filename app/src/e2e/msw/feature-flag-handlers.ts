import { HttpResponse, http } from 'msw/http';
import type { EvaluationRequest, FeatureFlagWritable } from '@/api-client';
import type { FeatureFlagAppModel } from '../../../e2e/app/_support/model/feature-flag-app-model';
import {
  decodeLastPathSegment,
  parseRequestJson,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const featureFlagHandlers = (
  model: FeatureFlagAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(/\/api\/feature-flags$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listFeatureFlags() }),
  ),
  http.post(
    /\/api\/feature-flags$/,
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ request }) => {
        const flag = model.createFeatureFlag(
          await parseRequestJson<FeatureFlagWritable>(request),
        );
        persist();
        return HttpResponse.json(flag, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling('Unexpected feature flag mock error', ({ request }) =>
      HttpResponse.json(
        model.getFeatureFlag(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling(
      'Unexpected feature flag mock error',
      async ({ request }) => {
        const flag = model.updateFeatureFlag(
          decodeLastPathSegment(request.url),
          await parseRequestJson<FeatureFlagWritable>(request),
        );
        persist();
        return HttpResponse.json(flag);
      },
    ),
  ),
  http.delete(
    /\/api\/feature-flags\/[^/]+$/,
    withErrorHandling('Unexpected feature flag mock error', ({ request }) => {
      model.deleteFeatureFlag(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.post(
    /\/api\/ofrep\/v1\/evaluate\/flags\/[^/]+$/,
    withErrorHandling(
      'Unexpected feature flag evaluation mock error',
      async ({ request }) => {
        const body = await parseRequestJson<EvaluationRequest>(request);
        return HttpResponse.json(
          model.evaluateFlag(
            decodeLastPathSegment(request.url),
            body.context ?? {},
          ),
        );
      },
    ),
  ),
];
