import type {
  GetInstancesBillingQuery,
  GetLicensesWithPricesQuery,
} from '@/api-client/graphql/graphql';
import type { AuditTrailAppModel } from './audit-trail-app-model';
import type { BillingAppModel } from './billing-app-model';
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

/** The page the API serves when a list names none, and the most it serves (`pagination`). */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * One page of a list, as the GraphQL API serves it: `limit` rows after the row
 * the opaque `cursor` names, here its position, and the cursor of the next page
 * while there is one. A list the console walks to its end asks as many times as
 * there are pages, so a mock that serves everything at once would hide it.
 */
export function graphqlPage<T>(
  rows: readonly T[],
  variables: GraphQLVariables,
): { hasMore: boolean; items: T[]; nextCursor: string | null } {
  const asked = Number(variables?.limit);
  const limit =
    Number.isInteger(asked) && asked > 0
      ? Math.min(asked, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const offset = Number.parseInt(String(variables?.cursor ?? '0'), 10) || 0;
  const hasMore = offset + limit < rows.length;

  return {
    hasMore,
    items: rows.slice(offset, offset + limit),
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

/**
 * What the unit tests and the stories answer to the documents of billing by default:
 * a page with nothing in it, which is what an organization with nothing subscribed and
 * nothing priced is served. They are sent only where billing is on, so a test or a story
 * that turns billing on and draws a list gets a list with no subscription and no price
 * instead of a request nobody answered; one that is about them declares its own.
 */
export const emptyBillingDocuments = {
  GetInstancesBilling: (): GetInstancesBillingQuery => ({
    instances: { hasMore: false, items: [], nextCursor: null },
  }),
  GetLicensesWithPrices: (): GetLicensesWithPricesQuery => ({
    licenses: { hasMore: false, items: [], nextCursor: null },
  }),
};

/**
 * What the lists of instances read of billing: the subscription of each
 * instance, a page at a time. The billing slot answers, since the subscriptions
 * are its own.
 */
export const instanceBillingOperations = (model: BillingAppModel) => ({
  GetInstancesBilling: (
    variables: GraphQLVariables,
  ): GetInstancesBillingQuery => ({
    instances: graphqlPage(
      model.subscriptions.listInstanceBillingSummaries(),
      variables,
    ),
  }),
});
