import { HttpResponse, http } from 'msw/http';
import type { CustomerWritable } from '@/api-client';
import type { CustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import { customerOperations } from '../../../e2e/app/_support/model/graphql-operations';
import {
  decodeLastPathSegment,
  getPathSegments,
  graphqlOperationHandler,
  parseRequestJson,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const customerHandlers = (
  model: CustomerAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler(customerOperations(model)),
  http.get(/\/api\/customers$/, () =>
    HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
  ),
  http.post(
    /\/api\/customers$/,
    withErrorHandling('Unexpected customer mock error', async ({ request }) => {
      const customer = model.createCustomer(
        await parseRequestJson<CustomerWritable>(request),
      );
      persist();
      return HttpResponse.json(customer, { status: 201 });
    }),
  ),
  http.get(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', ({ request }) =>
      HttpResponse.json(model.getCustomer(decodeLastPathSegment(request.url))),
    ),
  ),
  http.get(
    /\/api\/customers\/[^/]+\/integrations\/[^/]+$/,
    withErrorHandling(
      'Unexpected customer integration mock error',
      ({ request }) => {
        const segments = getPathSegments(request.url);
        const integration = model.getCustomerIntegration(
          decodeURIComponent(segments[2] ?? ''),
        );
        persist();
        return HttpResponse.json(integration);
      },
    ),
  ),
  http.put(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', async ({ request }) => {
      const customer = model.updateCustomer(
        decodeLastPathSegment(request.url),
        await parseRequestJson<CustomerWritable>(request),
      );
      persist();
      return HttpResponse.json(customer);
    }),
  ),
  http.delete(
    /\/api\/customers\/[^/]+$/,
    withErrorHandling('Unexpected customer mock error', ({ request }) => {
      model.deleteCustomer(decodeLastPathSegment(request.url));
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
