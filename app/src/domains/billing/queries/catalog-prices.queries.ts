import { graphql } from '@/api-client/graphql';

/**
 * Every license version and every add-on version of the organization, each with all its
 * prices, ACTIVE or DEPRECATED, in one request: what the price picker of a voucher is
 * drawn from, where the REST API would take a read of each version's prices, one request
 * for every version. The API gives a price no owner, so the owner is what the prices
 * hang on here. A deprecated price is asked for on purpose: a subscription may still be
 * billed by it, and a voucher may still name it.
 *
 * The two lists are paged apart: each has its own cursor, and `withLicenses` and
 * `withAddons` leave out the one that is already read to its end. The first request asks
 * for both, so an organization with fewer versions than a page of either reads them all
 * in that one request. The API checks the scopes of the whole document, whatever those
 * flags say: it needs read:licenses and read:addons, as the two REST lists do.
 */
export const GET_CATALOG_PRICES = graphql(`
  query GetCatalogPrices(
    $limit: Int
    $licensesCursor: String
    $addonsCursor: String
    $withLicenses: Boolean!
    $withAddons: Boolean!
  ) {
    licenses(limit: $limit, cursor: $licensesCursor)
      @include(if: $withLicenses) {
      nextCursor
      hasMore
      items {
        id
        name
        version
        lifecycleState
        prices {
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
    addons(limit: $limit, cursor: $addonsCursor) @include(if: $withAddons) {
      nextCursor
      hasMore
      items {
        id
        name
        versionName
        lifecycleState
        prices {
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
