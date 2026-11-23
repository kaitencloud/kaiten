import { type ArmedBillingProblem, ArmedProblems } from './armed-problems';
import { BillingProblem } from './billing-problem';
import type { FlagAnswer } from './platform-flags';

/** A platform flag's release stage, as its metadata names it. */
export type MockedBetaStage = 'private_beta' | 'public_beta' | 'open_beta';

/**
 * One platform flag the organization is evaluated on, as the platform flag
 * service serves it: a boolean flag (`on` / `off`), or a string flag whose
 * metadata names its `betaVariant`.
 */
export type MockedBetaFlag = {
  flagSlug: string;
  /** Absent: a flag that is not a beta. */
  stage?: MockedBetaStage;
  /** Whether the rules put the organization in the beta now. */
  enabled: boolean;
  /** A string flag: the variant served in the beta, named in its metadata. */
  betaVariant?: string;
  /** A string flag: the variant served out of the beta. */
  stableVariant?: string;
  /** The flag's metadata `title` and `description`, the copy written on the flag. */
  title?: string;
  description?: string;
  /** Set: the service reports the flag in error with this OpenFeature code. */
  errorCode?: string;
};

/** The refusals of `PUT /beta-features/{flagSlug}` a spec can arm, by the state the page draws. */
export type BetaFeatureRefusal =
  | 'invalidBody'
  | 'missingScope'
  | 'notToggleable'
  | 'notProvisioned'
  | 'notAccepted'
  | 'unavailable';

/** saas-api's refusals of the toggle, with the codes the page reads (`betaFeatureProblem`). */
export const BETA_FEATURE_REFUSALS: Record<
  BetaFeatureRefusal,
  ArmedBillingProblem
> = {
  invalidBody: {
    code: 'SetBetaFeature.InvalidBody',
    detail: 'enabled is required',
    status: 400,
  },
  missingScope: {
    code: 'RequireScope.MissingScope',
    detail: 'missing required scope: write:beta_features',
    status: 403,
  },
  notToggleable: {
    code: 'SetBetaFeature.NotToggleable',
    detail:
      'no beta that an organization turns on or off for itself is named so',
    status: 403,
  },
  notProvisioned: {
    code: 'SetBetaFeature.NotProvisioned',
    detail: 'this organization has no account on Kaiten Cloud yet',
    status: 404,
  },
  notAccepted: {
    code: 'SetBetaFeature.NotAccepted',
    detail: 'Kaiten has not opened this beta to this setting yet',
    status: 409,
  },
  unavailable: {
    code: 'SetBetaFeature.Unavailable',
    detail: 'Kaiten Cloud could not be reached; retry in a moment',
    status: 503,
  },
};

export type SerializedBetaFeaturesAppModel = {
  flags: MockedBetaFlag[];
  problems: Array<[BetaFeatureOperation, ArmedBillingProblem]>;
  writes: Array<{ flagSlug: string; enabled: boolean }>;
};

type BetaFeatureOperation = 'setBetaFeature';

const TOGGLEABLE: ReadonlySet<MockedBetaStage> = new Set([
  'public_beta',
  'open_beta',
]);

/**
 * The betas of the Beta features page: the platform flags the organization is
 * evaluated on, with their stage in their metadata, and saas-api's
 * `PUT /beta-features/{flagSlug}`, which moves the organization in or out of a
 * public or open beta. A toggle changes what the next evaluation answers, as
 * the real rules would, so the page can be seen reading the flags again.
 */
export class BetaFeaturesAppModel {
  private readonly flags: MockedBetaFlag[];
  private problems = new ArmedProblems<BetaFeatureOperation>();
  private readonly writes: Array<{ flagSlug: string; enabled: boolean }> = [];

  constructor(flags: MockedBetaFlag[] = []) {
    this.flags = structuredClone(flags);
  }

  static fromSerialized(
    state: SerializedBetaFeaturesAppModel,
  ): BetaFeaturesAppModel {
    const model = new BetaFeaturesAppModel(state.flags);
    model.problems = ArmedProblems.from(state.problems);
    model.writes.push(...state.writes);

    return model;
  }

  serializeForMsw(): SerializedBetaFeaturesAppModel {
    return {
      flags: structuredClone(this.flags),
      problems: this.problems.serialize(),
      writes: structuredClone(this.writes),
    };
  }

  /** The next toggle is refused as saas-api refuses it for `refusal`. */
  refuseNext(refusal: BetaFeatureRefusal, times = 1) {
    this.problems.arm('setBetaFeature', {
      ...BETA_FEATURE_REFUSALS[refusal],
      times,
    });
  }

  /** The toggles saas-api accepted, in order. */
  get acceptedWrites(): ReadonlyArray<{ flagSlug: string; enabled: boolean }> {
    return this.writes;
  }

  /**
   * The flags as the bulk OFREP evaluation answers them for the organization:
   * every one, by name or not, as the service answers every flag it holds.
   */
  evaluations(): FlagAnswer[] {
    return this.flags.map((flag) => {
      const metadata: Record<string, string> = {};
      if (flag.stage) metadata.stage = flag.stage;
      if (flag.betaVariant) metadata.betaVariant = flag.betaVariant;
      if (flag.title) metadata.title = flag.title;
      if (flag.description) metadata.description = flag.description;
      // As the service reports a flag it could not evaluate: its metadata
      // kept, no value.
      if (flag.errorCode) {
        return {
          key: flag.flagSlug,
          errorCode: flag.errorCode,
          errorDetails: 'the flag could not be evaluated',
          metadata,
        };
      }
      const variant = flag.betaVariant
        ? flag.enabled
          ? flag.betaVariant
          : (flag.stableVariant ?? 'stable')
        : flag.enabled
          ? 'on'
          : 'off';

      return {
        key: flag.flagSlug,
        value: flag.betaVariant ? variant : flag.enabled,
        variant,
        reason: 'TARGETING_MATCH',
        metadata,
      };
    });
  }

  /**
   * `PUT /beta-features/{flagSlug}`, in the order saas-api checks: the body, an
   * armed refusal, then the flag's stage, its trust boundary. The caller's scope
   * is checked before, by the handler, from the token.
   */
  setBetaFeature(flagSlug: string, body: unknown) {
    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== 'boolean') {
      const { code, detail, status } = BETA_FEATURE_REFUSALS.invalidBody;
      throw new BillingProblem(status, code, detail);
    }
    this.problems.consume('setBetaFeature');
    const flag = this.flags.find(
      (candidate) => candidate.flagSlug === flagSlug,
    );
    if (!flag?.stage || !TOGGLEABLE.has(flag.stage)) {
      const { code, detail, status } = BETA_FEATURE_REFUSALS.notToggleable;
      throw new BillingProblem(status, code, detail);
    }
    flag.enabled = enabled;
    this.writes.push({ flagSlug, enabled });

    return { flagSlug, enabled };
  }

  /** Closes a beta to the organization's own choice, as Kaiten would by editing the flag. */
  closeBeta(flagSlug: string) {
    const flag = this.flags.find(
      (candidate) => candidate.flagSlug === flagSlug,
    );
    if (flag) {
      flag.stage = 'private_beta';
    }
  }
}
