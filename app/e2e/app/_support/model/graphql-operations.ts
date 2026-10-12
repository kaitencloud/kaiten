import type { License, Price } from '@/api-client';
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

/**
 * Where the licenses and the prices they are sold at come from. They are not
 * always in one slot of the mocks: the slot of the licenses has both, and a
 * page with instances and billing but no licenses slot has the licenses of its
 * instances and the prices of its billing.
 */
export type LicenseCatalogue = {
  licenses(): License[];
  prices(licenseSlug: string, filter: { status: Price['status'] }): Price[];
};

/** A license and its active prices, as `GetLicensesWithPrices` selects them. */
export function toLicenseWithPrices(
  license: License,
  prices: readonly Price[],
): GetLicensesWithPricesQuery['licenses']['items'][number] {
  return {
    id: license.id,
    lifecycleState: license.lifecycleState ?? 'PUBLISHED',
    name: license.name,
    // A version nobody priced is sold by conversation; one with a price is sold.
    pricingType: license.pricingType ?? (prices.length > 0 ? 'PAID' : 'CUSTOM'),
    prices: prices.map((price) => ({
      billingModel: price.billingModel,
      billingPeriod: price.billingPeriod ?? null,
      billingTiming: price.billingTiming,
      currency: price.currency,
      displayLabel: price.displayLabel ?? null,
      displayOrder: price.displayOrder,
      id: price.id,
      isDefault: price.isDefault,
      meteredEntitlement: price.metered?.entitlementSlug ?? null,
      saleUnitFactor: price.metered?.saleUnitFactor ?? null,
      status: price.status,
      unitAmountDecimal: price.unitAmountDecimal,
    })),
    slug: license.slug ?? license.id,
    version: license.version,
    versionName: license.versionName ?? null,
  };
}

/** The licenses with the prices they are sold at now, a page at a time. */
export const licensePriceOperations = (catalogue: LicenseCatalogue) => ({
  GetLicensesWithPrices: (
    variables: GraphQLVariables,
  ): GetLicensesWithPricesQuery => ({
    licenses: graphqlPage(
      catalogue
        .licenses()
        .map((license) =>
          toLicenseWithPrices(
            license,
            catalogue.prices(license.slug ?? license.id, { status: 'ACTIVE' }),
          ),
        ),
      variables,
    ),
  }),
});
