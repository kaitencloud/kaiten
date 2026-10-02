import { HttpResponse, http } from 'msw/http';
import type { Entitlement } from '@/api-client';
import type { EntitlementAppModel } from '../../../e2e/app/_support/model/entitlement-app-model';
import {
  asFallback,
  decodeLastPathSegment,
  parseRequestJson,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const entitlementHandlers = (
  model: EntitlementAppModel,
  persist: PersistMswState = noop,
) => [
  http.get(/\/api\/entitlements$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listEntitlements() }),
  ),
  http.post(
    /\/api\/entitlements$/,
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ request }) => {
        const entitlement = model.createEntitlement(
          await parseRequestJson<Partial<Entitlement>>(request),
        );
        persist();
        return HttpResponse.json(entitlement, { status: 201 });
      },
    ),
  ),
  http.get(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling('Unexpected entitlement mock error', ({ request }) =>
      HttpResponse.json(
        model.getEntitlement(decodeLastPathSegment(request.url)),
      ),
    ),
  ),
  http.put(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling(
      'Unexpected entitlement mock error',
      async ({ request }) => {
        const entitlement = model.updateEntitlement(
          decodeLastPathSegment(request.url),
          await parseRequestJson<Partial<Entitlement>>(request),
        );
        persist();
        return HttpResponse.json(entitlement);
      },
    ),
  ),
  http.delete(
    /\/api\/entitlements\/[^/]+$/,
    withErrorHandling('Unexpected entitlement mock error', ({ request }) => {
      model.deleteEntitlement(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(/\/api\/entitlement-groups$/, () =>
    HttpResponse.json({ hasMore: false, items: [] }),
  ),
  // Keep this slot self-contained, after the handlers of installed owners.
  asFallback(
    http.get(/\/api\/customers$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/instances$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/licenses$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
  asFallback(
    http.get(/\/api\/licenses\/[^/]+\/entitlements$/, () =>
      HttpResponse.json({ hasMore: false, items: [] }),
    ),
  ),
];
