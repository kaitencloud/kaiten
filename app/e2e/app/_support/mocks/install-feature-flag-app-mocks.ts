import type { Page } from '@playwright/test';
import type { EvaluationRequest, FeatureFlagWritable } from '@/api-client';
import type { FeatureFlagAppModel } from '../model/feature-flag-app-model';
import { tryInstallMswMocks } from './install-app-mocks';
import { makeRestRouter, parseJsonBody } from './rest-route-helpers';

export async function installFeatureFlagAppMocks(
  page: Page,
  model: FeatureFlagAppModel,
) {
  if (await tryInstallMswMocks(page, 'featureFlags', model)) {
    return;
  }

  await installFeatureFlagPageRouteMocks(page, model);
}

async function installFeatureFlagPageRouteMocks(
  page: Page,
  model: FeatureFlagAppModel,
) {
  await page.route(
    // A list read carries its paging query (?limit=…&cursor=…).
    /\/api\/feature-flags(\?.*)?$/,
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listFeatureFlags() }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createFeatureFlag(parseJsonBody<FeatureFlagWritable>(route)),
        },
      ],
      { errorMessage: 'Unexpected feature flag mock error' },
    ),
  );

  await page.route(
    '**/api/feature-flags/*',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getFeatureFlag(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateFeatureFlag(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<FeatureFlagWritable>(route),
            ),
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteFeatureFlag(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
      ],
      { errorMessage: 'Unexpected feature flag mock error' },
    ),
  );

  // OFREP evaluation endpoint: POST /api/ofrep/v1/evaluate/flags/:slug.
  // Outside the standard CRUD shape, so handled with a dedicated route.
  await page.route(
    '**/api/ofrep/v1/evaluate/flags/*',
    makeRestRouter(
      [
        {
          method: 'POST',
          segments: 6,
          handle: ({ route, segments }) => {
            const featureFlagSlug = decodeURIComponent(segments.at(-1) ?? '');
            const request = parseJsonBody<EvaluationRequest>(route);
            return model.evaluateFlag(featureFlagSlug, request.context ?? {});
          },
          successStatus: 200,
        },
      ],
      { errorMessage: 'Unexpected feature flag evaluation mock error' },
    ),
  );
}
