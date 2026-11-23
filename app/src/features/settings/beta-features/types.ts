/** The stages of a beta an organization turns on or off for itself. */
export type BetaStage = 'public_beta' | 'open_beta';

/** A beta listed on the page, in the state its flag is evaluated in now. */
export type BetaFeature = {
  flagSlug: string;
  stage: BetaStage;
  /** Whether the organization is in the beta, read off the evaluation. */
  enabled: boolean;
  /**
   * The flag's metadata `title` and `description`, when they are non-empty
   * strings: what names the beta while the translations have no entry for its
   * slug (`useBetaFeatureCopy`).
   */
  metadataTitle?: string;
  metadataDescription?: string;
};

/** What `PUT /beta-features/{flagSlug}` answers. */
export type BetaFeatureState = {
  flagSlug: string;
  enabled: boolean;
};

/**
 * Why a toggle was refused, in the terms the page explains it in.
 *
 * - `invalid-body`: the request was refused as malformed.
 * - `missing-scope`: the caller does not hold the scope that writes betas.
 * - `not-toggleable`: the beta is no longer open to the organization.
 * - `not-provisioned`: Kaiten Cloud has no record of the organization yet.
 * - `not-accepted`: Kaiten Cloud has not opened this beta to the setting yet.
 * - `unavailable`: Kaiten Cloud could not be reached; a retry may work.
 * - `unexpected`: any other failure.
 */
export type BetaFeatureProblem =
  | 'invalid-body'
  | 'missing-scope'
  | 'not-toggleable'
  | 'not-provisioned'
  | 'not-accepted'
  | 'unavailable'
  | 'unexpected';
