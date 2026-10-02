import type { Page } from '@playwright/test';
import type {
  ComponentWritable,
  ReleaseWritable,
  DeploymentZoneWritable,
} from '@/api-client';
import type { ReleaseManagementAppModel } from '../model/release-management-app-model';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import { makeRestRouter, parseJsonBody } from './rest-route-helpers';

export async function installReleaseManagementAppMocks(
  page: Page,
  model: ReleaseManagementAppModel,
) {
  if (await tryInstallMswMocks(page, 'releaseManagement', model)) {
    return;
  }

  await installReleaseManagementPageRouteMocks(page, model);
}

async function installReleaseManagementPageRouteMocks(
  page: Page,
  model: ReleaseManagementAppModel,
) {
  await installGraphQLOperationMocks(page, {
    GetReleaseManagementOverview: () =>
      model.getReleaseManagementOverviewData(),
    MetadataFields: () => ({
      metadataFields: { hasMore: false, nextCursor: null, items: [] },
    }),
  });

  await page.route(
    '**/api/components**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listComponents() }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createComponent(parseJsonBody<ComponentWritable>(route)),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getComponent(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateComponent(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<ComponentWritable>(route),
            ),
        },
      ],
      { errorMessage: 'Unexpected component mock error' },
    ),
  );

  await page.route(
    '**/api/releases**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listReleases() }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createRelease(parseJsonBody<ReleaseWritable>(route)),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getRelease(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteRelease(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
      ],
      { errorMessage: 'Unexpected release mock error' },
    ),
  );

  await page.route(
    '**/api/deployment-zones**',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({
            hasMore: false,
            items: model.listDeploymentZones(),
          }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createDeploymentZone(
              parseJsonBody<DeploymentZoneWritable>(route),
            ),
        },
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getDeploymentZone(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateDeploymentZone(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<DeploymentZoneWritable>(route),
            ),
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteDeploymentZone(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
      ],
      { errorMessage: 'Unexpected deployment zone mock error' },
    ),
  );
}
