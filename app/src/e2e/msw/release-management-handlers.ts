import { HttpResponse } from 'msw/http';
import {
  handleCreateComponent,
  handleCreateDeploymentZone,
  handleCreateRelease,
  handleDeleteDeploymentZone,
  handleDeleteRelease,
  handleGetComponent,
  handleGetDeploymentZoneBySlug,
  handleGetReleaseBySlug,
  handleListComponents,
  handleListDeploymentZones,
  handleListReleases,
  handleUpdateComponent,
  handleUpdateDeploymentZone,
} from '@/api-client/msw.gen';
import type { ReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import {
  asFallback,
  graphqlOperationHandler,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const releaseManagementHandlers = (
  model: ReleaseManagementAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler({
    GetReleaseManagementOverview: () =>
      model.getReleaseManagementOverviewData(),
  }),
  asFallback(
    graphqlOperationHandler({
      MetadataFields: () => ({
        metadataFields: { hasMore: false, nextCursor: null, items: [] },
      }),
    }),
  ),
  handleListComponents(() =>
    HttpResponse.json({ hasMore: false, items: model.listComponents() }),
  ),
  handleCreateComponent(
    withErrorHandling(
      'Unexpected component mock error',
      async ({ request }) => {
        const component = model.createComponent(await request.json());
        persist();
        return HttpResponse.json(component, { status: 201 });
      },
    ),
  ),
  handleGetComponent(
    withErrorHandling('Unexpected component mock error', ({ params }) =>
      HttpResponse.json(model.getComponent(params.componentSlug)),
    ),
  ),
  handleUpdateComponent(
    withErrorHandling(
      'Unexpected component mock error',
      async ({ params, request }) => {
        const component = model.updateComponent(
          params.componentSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(component);
      },
    ),
  ),
  handleListReleases(() =>
    HttpResponse.json({ hasMore: false, items: model.listReleases() }),
  ),
  handleCreateRelease(
    withErrorHandling('Unexpected release mock error', async ({ request }) => {
      const release = model.createRelease(await request.json());
      persist();
      return HttpResponse.json(release, { status: 201 });
    }),
  ),
  handleGetReleaseBySlug(
    withErrorHandling('Unexpected release mock error', ({ params }) =>
      HttpResponse.json(model.getRelease(params.releaseSlug)),
    ),
  ),
  handleDeleteRelease(
    withErrorHandling('Unexpected release mock error', ({ params }) => {
      model.deleteRelease(params.releaseSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleListDeploymentZones(() =>
    HttpResponse.json({ hasMore: false, items: model.listDeploymentZones() }),
  ),
  handleCreateDeploymentZone(
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ request }) => {
        const zone = model.createDeploymentZone(await request.json());
        persist();
        return HttpResponse.json(zone, { status: 201 });
      },
    ),
  ),
  handleGetDeploymentZoneBySlug(
    withErrorHandling('Unexpected deployment zone mock error', ({ params }) =>
      HttpResponse.json(model.getDeploymentZone(params.deploymentZoneSlug)),
    ),
  ),
  handleUpdateDeploymentZone(
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ params, request }) => {
        const zone = model.updateDeploymentZone(
          params.deploymentZoneSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(zone);
      },
    ),
  ),
  handleDeleteDeploymentZone(
    withErrorHandling('Unexpected deployment zone mock error', ({ params }) => {
      model.deleteDeploymentZone(params.deploymentZoneSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
