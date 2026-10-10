import { graphql } from '@/api-client/graphql';

/**
 * What the instance lists show of an instance's subscription. It is a document of
 * its own and not a field of `GetInstancesWithRelations`: the API checks the
 * scopes of a document once and refuses the whole of it when one is missing, and
 * `Instance.billing` needs read:billing, which a session that lists instances
 * may not hold. The lists keep their document, and ask for this one only when
 * billing is on and the session may read it. It takes the page variables of the
 * list, so that one request answers one page of it.
 */
export const GET_INSTANCES_BILLING = graphql(`
  query GetInstancesBilling($limit: Int, $cursor: String) {
    instances(limit: $limit, cursor: $cursor) {
      nextCursor
      hasMore
      items {
        slug
        billing {
          status
          providerKind
          currentPeriodEnd
          cancelAtPeriodEnd
          pastDueSince
          trialEndsAt
        }
      }
    }
  }
`);
