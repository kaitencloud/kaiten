/** A customer session (`kst_`) saas-api mints for the organization's own plan. */
export type PlanSession = {
  token: string;
  /** RFC 3339. */
  expiresAt: string;
};

/**
 * Why the page has no session, in the terms the page explains it in.
 *
 * - `not-enabled`: the organization does not have the page (the `plan-billing`
 *   flag is off for it on Kaiten Cloud).
 * - `not-provisioned`: Kaiten Cloud has no record of the organization yet.
 * - `forbidden`: the caller is not an administrator of the organization.
 * - `unavailable`: Kaiten Cloud could not be reached, or answered nothing usable.
 */
export type PlanSessionProblem =
  | 'not-enabled'
  | 'not-provisioned'
  | 'forbidden'
  | 'unavailable';
