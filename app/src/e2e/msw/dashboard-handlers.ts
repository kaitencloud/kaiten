import type { DashboardAppModel } from '../../../e2e/app/_support/model/dashboard-app-model';
import { dashboardOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler } from './handler-factory';

export const dashboardHandlers = (model: DashboardAppModel) => [
  graphqlOperationHandler(dashboardOperations(model)),
];
