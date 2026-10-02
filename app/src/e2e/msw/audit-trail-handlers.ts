import type { AuditTrailAppModel } from '../../../e2e/app/_support/model/audit-trail-app-model';
import { auditTrailOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler } from './handler-factory';

export const auditTrailHandlers = (model: AuditTrailAppModel) => [
  graphqlOperationHandler(auditTrailOperations(model)),
];
