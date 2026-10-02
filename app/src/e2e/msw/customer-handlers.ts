import { HttpResponse } from 'msw/http';
import {
  handleCreateCustomer,
  handleDeleteCustomer,
  handleGetCustomer,
  handleGetCustomerIntegration,
  handleListCustomers,
  handleUpdateCustomer,
} from '@/api-client/msw.gen';
import type { CustomerAppModel } from '../../../e2e/app/_support/model/customer-app-model';
import { customerOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler, withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const customerHandlers = (
  model: CustomerAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler(customerOperations(model)),
  handleListCustomers(() =>
    HttpResponse.json({ hasMore: false, items: model.listCustomers() }),
  ),
  handleCreateCustomer(
    withErrorHandling('Unexpected customer mock error', async ({ request }) => {
      const customer = model.createCustomer(await request.json());
      persist();
      return HttpResponse.json(customer, { status: 201 });
    }),
  ),
  handleGetCustomer(
    withErrorHandling('Unexpected customer mock error', ({ params }) =>
      HttpResponse.json(model.getCustomer(params.customerSlug)),
    ),
  ),
  handleGetCustomerIntegration(
    withErrorHandling(
      'Unexpected customer integration mock error',
      ({ params }) => {
        const integration = model.getCustomerIntegration(params.customerSlug);
        persist();
        return HttpResponse.json(integration);
      },
    ),
  ),
  handleUpdateCustomer(
    withErrorHandling(
      'Unexpected customer mock error',
      async ({ params, request }) => {
        const customer = model.updateCustomer(
          params.customerSlug,
          await request.json(),
        );
        persist();
        return HttpResponse.json(customer);
      },
    ),
  ),
  handleDeleteCustomer(
    withErrorHandling('Unexpected customer mock error', ({ params }) => {
      model.deleteCustomer(params.customerSlug);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
