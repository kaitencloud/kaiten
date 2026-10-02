import { handleGetServiceAccounts } from '@/api-client/msw.gen';
import type { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { dashboardOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { asFallback, graphqlOperationHandler } from './handler-factory';

export const dashboardHandlers = (model: DashboardAppModel) => [
  graphqlOperationHandler(dashboardOperations(model)),
  // The token cards read the service accounts, which no slot owns yet: none.
  asFallback(handleGetServiceAccounts({ body: { hasMore: false, items: [] } })),
];
