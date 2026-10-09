import { graphql } from '@/api-client/graphql';

/**
 * The licenses of the organization with the prices each one is sold at now, in one
 * request for a page of them: the price summary of the list of licenses and the
 * plans an instance can move to are read from it, where the REST API would take a
 * read of the licenses and then one read of the prices of every version. `prices`
 * needs read:licenses, as the licenses do, and only the ACTIVE ones are asked
 * for: a deprecated price is no longer offered. It is a document of its own, sent
 * only once billing is on, so that the lists of licenses and the other documents
 * stay as they are.
 */
export const GET_LICENSES_WITH_PRICES = graphql(`
  query GetLicensesWithPrices($limit: Int, $cursor: String) {
    licenses(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        id
        slug
        name
        version
        versionName
        lifecycleState
        pricingType
        prices(status: "ACTIVE") {
          id
          billingModel
          billingTiming
          billingPeriod
          currency
          unitAmountDecimal
          meteredEntitlement
          saleUnitFactor
          displayLabel
          displayOrder
          isDefault
          status
        }
      }
    }
  }
`);
