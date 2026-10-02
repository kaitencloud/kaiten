import { HttpResponse } from 'msw/http';
import {
  handleCreateEntitlement,
  handleDeleteEntitlement,
  handleGetEntitlement,
  handleGetInstances,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListCustomers,
  handleListEntitlementGroups,
  handleListEntitlements,
  handleUpdateEntitlement,
} from '@/api-client/msw.gen';
import type { EntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import { asFallback, withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const emptyPage = { body: { hasMore: false, items: [] } };

export const entitlementHandlers = (
  model: EntitlementAppModel,
  persist: PersistMswState = noop,
) => [
  handleListEntitlements(() =>
    HttpResponse.json({ hasMore: false, items: model.listEntitlements() }),
  ),
  handleCreateEntitlement(
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ request }) => {
        const entitlement = model.createEntitlement(await request.json());
        persist();
        return HttpResponse.json(entitlement, { status: 201 });
      },
    ),
  ),
  handleGetEntitlement(
    withErrorHandling('Unexpected entitlement mock error', ({ params }) =>
      HttpResponse.json(model.getEntitlement(params.entitlementSlug)),
    ),
  ),
  handleUpdateEntitlement(
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ params, request }) => {
        const entitlement = model.updateEntitlement(
          params.entitlementSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(entitlement);
      },
    ),
  ),
  handleDeleteEntitlement(
    withErrorHandling('Unexpected entitlement mock error', ({ params }) => {
      model.deleteEntitlement(params.entitlementSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  handleListEntitlementGroups(emptyPage),
  // Keep this slot self-contained, after the handlers of installed owners.
  asFallback(handleListCustomers(emptyPage)),
  asFallback(handleGetInstances(emptyPage)),
  asFallback(handleGetLicenses(emptyPage)),
  asFallback(handleGetLicenseEntitlements(emptyPage)),
];
