import { graphql } from '@/api-client/graphql';

/**
 * Every licence version with what it grants and the active rules that price the
 * models on it, a page of versions per request. One read for the whole rate
 * card: the vendor costs of the models are not in the graph and come from REST.
 */
export const AI_RATE_CARD = graphql(`
  query AiRateCard($limit: Int, $cursor: String) {
    licenses(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        id slug name version versionNumber versionName lifecycleState isDefault
        family { id slug currentVersion { slug name versionNumber } }
        entitlements { entitlementSlug entitlementType value unlimited limitCapExceededOveragePercent }
        conversionRules(status: ACTIVE) {
          id licenseSlug entitlementSlug modelSlug requestType status grantedByLicense grantedByAddons
          chargeOnError minimumCreditsPerRequest maximumCreditsPerRequest createdAt updatedAt
          createdBy { id name } updatedBy { id name }
          rates { perRequest perInputToken perCachedInputToken perCacheWriteToken perOutputToken perUnit perSecond }
        }
      }
    }
  }
`);

/**
 * What add-on versions can grant of a credit pool to the instances of one
 * licence's family. A document of its own: the field needs billing to be on and
 * the add-on read scope, and a refusal of either fails the whole document, which must
 * not take the rate card down with it.
 */
export const AI_ADDON_GRANTS = graphql(`
  query AiAddonGrants($licenseSlug: String!, $entitlementSlug: String) {
    license(slug: $licenseSlug) {
      slug
      addonGrants(entitlementSlug: $entitlementSlug) {
        entitlementSlug addonId addonSlug addonFamilySlug addonName addonVersion
        lifecycleState isDefault maxQuantity value unlimited overrideBehavior
      }
    }
  }
`);
