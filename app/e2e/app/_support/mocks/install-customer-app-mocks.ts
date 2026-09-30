import type { Page } from '@playwright/test';
import type { CustomerWritable } from '@/api-client';
import type { CustomerAppModel } from '../model/customer-app-model';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import { makeRestRouter, parseJsonBody } from './rest-route-helpers';

export async function installCustomerAppMocks(
  page: Page,
  model: CustomerAppModel,
) {
  if (await tryInstallMswMocks(page, 'customers', model)) {
    return;
  }

  await installCustomerPageRouteMocks(page, model);
}

async function installCustomerPageRouteMocks(
  page: Page,
  model: CustomerAppModel,
) {
  await installGraphQLOperationMocks(page, {
    GetCustomersWithInstances: () => model.getCustomersWithInstances(),
    GetInstancesWithRelations: () => model.getInstancesWithRelations(),
  });

  await page.route(
    '**/api/customers',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 2,
          handle: () => ({ hasMore: false, items: model.listCustomers() }),
        },
        {
          method: 'POST',
          segments: 2,
          handle: ({ route }) =>
            model.createCustomer(parseJsonBody<CustomerWritable>(route)),
        },
      ],
      { errorMessage: 'Unexpected customer mock error' },
    ),
  );

  await page.route(
    '**/api/customers/*',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 3,
          handle: ({ segments }) =>
            model.getCustomer(decodeURIComponent(segments[2] ?? '')),
        },
        {
          method: 'PUT',
          segments: 3,
          handle: ({ route, segments }) =>
            model.updateCustomer(
              decodeURIComponent(segments[2] ?? ''),
              parseJsonBody<CustomerWritable>(route),
            ),
        },
        {
          method: 'DELETE',
          segments: 3,
          handle: ({ segments }) => {
            model.deleteCustomer(decodeURIComponent(segments[2] ?? ''));
            return null;
          },
        },
      ],
      {
        errorMessage: 'Unexpected customer mock error',
        // Default fallback: 400. The model throws with `httpStatus: 409` for
        // delete-with-active-instances and `httpStatus: <armed>` for one-shot
        // injected errors, so those bypass the fallback.
        defaultErrorStatus: 400,
      },
    ),
  );

  await page.route(
    '**/api/customers/*/integrations/*',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 5,
          handle: ({ segments }) =>
            model.getCustomerIntegration(decodeURIComponent(segments[2] ?? '')),
        },
      ],
      { errorMessage: 'Unexpected customer integration mock error' },
    ),
  );
}
