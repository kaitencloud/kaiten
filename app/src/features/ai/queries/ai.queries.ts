import { graphql } from '@/api-client/graphql';

export const AI_MATRIX = graphql(`
  query AiMatrix($familySlug: String!) {
    models { id name slug vendor modality status externalIds }
    licenseFamily(slug: $familySlug) {
      id slug
      versions {
        id slug name version versionName lifecycleState
        entitlements { entitlementSlug entitlementType }
        conversionRules(status: ACTIVE) {
          id licenseSlug entitlementSlug modelSlug requestType status grantedByLicense
          chargeOnError minimumCreditsPerRequest maximumCreditsPerRequest createdAt updatedAt
          rates { perRequest perInputToken perCachedInputToken perCacheWriteToken perOutputToken perUnit perSecond }
        }
      }
    }
  }
`);
