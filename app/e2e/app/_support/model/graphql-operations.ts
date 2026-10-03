import type { AuditTrailAppModel } from './audit-trail-app-model';
import type { ConnectorAppModel } from './connector-app-model';
import type { CustomerAppModel } from './customer-app-model';
import type { DashboardAppModel } from './dashboard-app-model';
import type { GraphQLVariables } from '../contracts/mock-http';

// Operation descriptions used by MSW handlers over the stateful models.
export const auditTrailOperations = (model: AuditTrailAppModel) => ({
  GetGlobalAuditTrail: (variables: GraphQLVariables) =>
    model.getGlobalAuditTrail(variables),
});
export const connectorOperations = (model: ConnectorAppModel) => ({
  GetAttioSyncedRecords: () => model.getSyncedRecords(),
});
export const customerOperations = (model: CustomerAppModel) => ({
  GetCustomersWithInstances: () => model.getCustomersWithInstances(),
  GetInstancesWithRelations: () => model.getInstancesWithRelations(),
});
export const dashboardOperations = (model: DashboardAppModel) => ({
  GetDashboardData: () => model.getDashboardData(),
});
