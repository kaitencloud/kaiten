import { HttpResponse, http } from 'msw';
import type {
  ComponentWritable,
  DeploymentZoneWritable,
  ReleaseWritable,
} from '@/api-client';
import type { ReleaseManagementAppModel } from '../../../e2e/app/_support/model/release-management-app-model';
import {
  decodeLastPathSegment,
  graphqlOperationHandler,
  parseRequestJson,
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
  http.get(/\/api\/components$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listComponents() }),
  ),
  http.post(
    /\/api\/components$/,
    withErrorHandling(
      'Unexpected component mock error',
      async ({ request }) => {
        const component = model.createComponent(
          await parseRequestJson<ComponentWritable>(request),
        );
        persist();
        return HttpResponse.json(component, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/components\/[^/]+$/,
    withErrorHandling('Unexpected component mock error', ({ request }) =>
      HttpResponse.json(model.getComponent(decodeLastPathSegment(request.url))),
    ),
  ),
  http.put(
    /\/api\/components\/[^/]+$/,
    withErrorHandling(
      'Unexpected component mock error',
      async ({ request }) => {
        const component = model.updateComponent(
          decodeLastPathSegment(request.url),
          await parseRequestJson<ComponentWritable>(request),
        );
        persist();
        return HttpResponse.json(component);
      },
    ),
  ),
  http.get(/\/api\/releases$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listReleases() }),
  ),
  http.post(
    /\/api\/releases$/,
    withErrorHandling('Unexpected release mock error', async ({ request }) => {
      const release = model.createRelease(
        await parseRequestJson<ReleaseWritable>(request),
      );
      persist();
      return HttpResponse.json(release, { status: 201 });
    }),
  ),
  http.get(
    /\/api\/releases\/[^/]+$/,
    withErrorHandling('Unexpected release mock error', ({ request }) =>
      HttpResponse.json(model.getRelease(decodeLastPathSegment(request.url))),
    ),
  ),
  http.delete(
    /\/api\/releases\/[^/]+$/,
    withErrorHandling('Unexpected release mock error', ({ request }) => {
      model.deleteRelease(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(/\/api\/deployment-zones$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listDeploymentZones() }),
  ),
  http.post(
    /\/api\/deployment-zones$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ request }) => {
        const zone = model.createDeploymentZone(
          await parseRequestJson<DeploymentZoneWritable>(request),
        );
        persist();
        return HttpResponse.json(zone, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling('Unexpected deployment zone mock error', ({ request }) =>
      HttpResponse.json(
        model.getDeploymentZone(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      async ({ request }) => {
        const zone = model.updateDeploymentZone(
          decodeLastPathSegment(request.url),
          await parseRequestJson<DeploymentZoneWritable>(request),
        );
        persist();
        return HttpResponse.json(zone);
      },
    ),
  ),
  http.delete(
    /\/api\/deployment-zones\/[^/]+$/,
    withErrorHandling(
      'Unexpected deployment zone mock error',
      ({ request }) => {
        model.deleteDeploymentZone(decodeLastPathSegment(request.url));
        persist();
        return new HttpResponse(null, { status: 204 });
      },
    ),
  ),
];
