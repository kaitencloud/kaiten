import { HttpResponse } from 'msw/http';
import {
  handleCreateInstance,
  handleDeleteInstance,
  handleGetCustomer,
  handleGetEntitlementsUsageMetrics,
  handleGetInstance,
  handleGetInstances,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListCustomers,
  handleListDeploymentZones,
  handleListLicenseFamilies,
  handleListReleases,
  handlePatchInstance,
  handleUpdateInstance,
} from '@/api-client/msw.gen';
import type { InstanceAppModel } from '../../../e2e/app/_support/model/instance-app-model';
import {
  asFallback,
  graphqlOperationHandler,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const instanceHandlers = (
  model: InstanceAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler({
    GetInstancesWithRelations: () => model.getInstancesWithRelations(),
    // The fields the model declares are instance fields: another resource type
    // declares none.
    MetadataFields: (variables) =>
      variables?.resourceType === 'INSTANCE'
        ? model.getMetadataFields()
        : { metadataFields: { hasMore: false, nextCursor: null, items: [] } },
  }),
  // Lists other slots own, as fallbacks: the customer list, built from this
  // slot's instances, and the release-management overview, which the instance
  // detail overview pulls eagerly and gets empty, to keep the slot
  // self-contained.
  asFallback(
    graphqlOperationHandler({
      GetCustomersWithInstances: () => model.getCustomersWithInstances(),
      GetReleaseManagementOverview: () => ({
        releases: { hasMore: false, items: [], nextCursor: null },
      }),
    }),
  ),
  // Relations keep this slot self-contained, as before the extraction.
  handleListCustomers(() =>
    HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
  ),
  handleGetCustomer(
    withErrorHandling('Unexpected customer mock error', ({ params }) =>
      HttpResponse.json(model.getCustomer(params.customerSlug)),
    ),
  ),
  handleGetLicenses(() =>
    HttpResponse.json({ hasMore: false, items: model.listLicenses() }),
  ),
  handleListLicenseFamilies(() =>
    HttpResponse.json({
      hasMore: false,
      items: model.listLicenseFamilies(),
    }),
  ),
  handleGetLicenseEntitlements(
    withErrorHandling('Unexpected license mock error', ({ params }) =>
      HttpResponse.json({
        hasMore: false,
        items: model.getLicenseEntitlements(params.licenseSlug),
      }),
    ),
  ),
  handleGetLicense(
    withErrorHandling('Unexpected license mock error', ({ params }) =>
      HttpResponse.json(model.getLicense(params.licenseSlug)),
    ),
  ),
  // Offered as targets by the deploy / migrate action. Fallbacks: the
  // release-management slot owns them when it is installed.
  asFallback(
    handleListDeploymentZones(() =>
      HttpResponse.json({
        hasMore: false,
        items: model.listDeploymentZones(),
      }),
    ),
  ),
  asFallback(handleListReleases({ body: { hasMore: false, items: [] } })),
  handleGetInstances(() =>
    HttpResponse.json({ hasMore: false, items: model.listInstances() }),
  ),
  handleCreateInstance(
    withErrorHandling('Unexpected instance mock error', async ({ request }) => {
      const instance = model.createInstance(await request.json());
      persist();
      return HttpResponse.json(instance, { status: 201 });
    }),
  ),
  handleGetEntitlementsUsageMetrics(
    withErrorHandling('Unexpected instance mock error', ({ params }) =>
      HttpResponse.json(model.getEntitlementsUsageMetrics(params.instanceSlug)),
    ),
  ),
  handleGetInstance(
    withErrorHandling('Unexpected instance mock error', ({ params }) =>
      HttpResponse.json(model.getInstance(params.instanceSlug)),
    ),
  ),
  handleUpdateInstance(
    withErrorHandling(
      'Unexpected instance mock error',
      async ({ params, request }) => {
        const instance = model.updateInstance(
          params.instanceSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(instance);
      },
    ),
  ),
  // The lifecycle stage and the status, which the edit form and the detail
  // page save apart from the PUT.
  handlePatchInstance(
    withErrorHandling(
      'Unexpected instance mock error',
      async ({ params, request }) => {
        model.patchInstance(params.instanceSlug, await request.json());
        persist();
        return new HttpResponse(null, { status: 204 });
      },
    ),
  ),
  handleDeleteInstance(
    withErrorHandling('Unexpected instance mock error', ({ params }) => {
      model.deleteInstance(params.instanceSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
