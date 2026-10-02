import { HttpResponse, http } from 'msw/http';
import type { InstanceWritable, PatchInstanceBody } from '@/api-client';
import type { InstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import {
  decodeLastPathSegment,
  getPathSegments,
  graphqlOperationHandler,
  parseRequestJson,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const instanceHandlers = (
  model: InstanceAppModel,
  persist: PersistMswState = noop,
) => {
  const getCustomerSegmentSlug = (url: string) =>
    decodeURIComponent(getPathSegments(url)[2] ?? '');
  return [
    graphqlOperationHandler({
      GetCustomersWithInstances: () => model.getCustomersWithInstances(),
      GetInstancesWithRelations: () => model.getInstancesWithRelations(),
      MetadataFields: () => model.getMetadataFields(),
      GetReleaseManagementOverview: () => ({ releases: { items: [] } }),
    }),
    // Relations keep this slot self-contained, as before the extraction.
    http.get(/\/api\/customers$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
    ),
    http.get(
      /\/api\/customers\/[^/]+$/,
      withErrorHandling('Unexpected customer mock error', ({ request }) =>
        HttpResponse.json(
          model.getCustomer(decodeLastPathSegment(request.url)),
        ),
      ),
    ),
    http.get(/\/api\/licenses$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listLicenses() }),
    ),
    http.get(/\/api\/license-families$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listLicenseFamilies() }),
    ),
    http.get(
      /\/api\/licenses\/[^/]+\/entitlements$/,
      withErrorHandling('Unexpected license mock error', ({ request }) =>
        HttpResponse.json({
          hasMore: false,
          items: model.getLicenseEntitlements(
            getCustomerSegmentSlug(request.url),
          ),
        }),
      ),
    ),
    http.get(
      /\/api\/licenses\/[^/]+$/,
      withErrorHandling('Unexpected license mock error', ({ request }) =>
        HttpResponse.json(model.getLicense(decodeLastPathSegment(request.url))),
      ),
    ),
    http.get(/\/api\/deployment-zones$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listDeploymentZones() }),
    ),
    http.get(/\/api\/releases$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
    http.get(/\/api\/instances$/, () =>
      HttpResponse.json({ hasMore: false, items: model.listInstances() }),
    ),
    http.post(
      /\/api\/instances$/,
      withErrorHandling(
        'Unexpected instance mock error',
        async ({ request }) => {
          const instance = model.createInstance(
            await parseRequestJson<InstanceWritable>(request),
          );
          persist();
          return HttpResponse.json(instance, { status: 201 });
        },
      ),
    ),
    http.get(
      /\/api\/instances\/[^/]+\/entitlements\/usage$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) =>
        HttpResponse.json(
          model.getEntitlementsUsageMetrics(
            getCustomerSegmentSlug(request.url),
          ),
        ),
      ),
    ),
    http.get(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) =>
        HttpResponse.json(
          model.getInstance(decodeLastPathSegment(request.url)),
        ),
      ),
    ),
    http.put(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling(
        'Unexpected instance mock error',
        async ({ request }) => {
          const instance = model.updateInstance(
            decodeLastPathSegment(request.url),
            await parseRequestJson<InstanceWritable>(request),
          );
          persist();
          return HttpResponse.json(instance);
        },
      ),
    ),
    // The lifecycle stage and the status, which the edit form and the detail
    // page save apart from the PUT.
    http.patch(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling(
        'Unexpected instance mock error',
        async ({ request }) => {
          model.patchInstance(
            decodeLastPathSegment(request.url),
            await parseRequestJson<PatchInstanceBody>(request),
          );
          persist();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    ),
    http.delete(
      /\/api\/instances\/[^/]+$/,
      withErrorHandling('Unexpected instance mock error', ({ request }) => {
        model.deleteInstance(decodeLastPathSegment(request.url));
        persist();
        return new HttpResponse(null, { status: 204 });
      }),
    ),
  ];
};
