import type { BillingCapabilities, ErrorDetail } from '@/api-client';
import { zBillingCapabilities } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { billingCapabilitiesProfiles } from './billing-capabilities';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * A refusal the Core API answers with a problem document. The handlers render
 * it as application/problem+json with its code and detail, so the console shows
 * the reason the real API would give.
 */
export class BillingProblem extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly errors?: ErrorDetail[];
  readonly retryAfterSeconds?: number;

  constructor(
    httpStatus: number,
    code: string | undefined,
    detail: string,
    extras: { errors?: ErrorDetail[]; retryAfterSeconds?: number } = {},
  ) {
    super(detail);
    this.httpStatus = httpStatus;
    this.code = code;
    this.errors = extras.errors;
    this.retryAfterSeconds = extras.retryAfterSeconds;
  }
}

/**
 * How `GET /billing/capabilities` stops answering with its body, for as long as
 * the model keeps it so: a problem document, or no answer at all (an API that
 * never responds, which the console gives up on after its timeout).
 */
export type CapabilitiesOutage =
  | { kind: 'hang' }
  | { kind: 'problem'; status: number; code?: string; detail: string };

/**
 * The ways the capabilities can be unreadable. Each hides billing without an
 * error page; they differ in what a link to a billing screen explains.
 */
export const CAPABILITIES_OUTAGES = {
  /** The caller's token lacks `read:billing`: the stale identity-provider template. */
  missingScope: {
    code: 'Auth.MissingScope',
    detail: 'missing required scope: read:billing',
    kind: 'problem',
    status: 403,
  },
  /** A release older than billing: the route does not exist. */
  notImplemented: {
    detail: 'Not Found',
    kind: 'problem',
    status: 404,
  },
  /** The entitlement check could not be made, or the API is down. */
  unavailable: {
    code: 'Billing.EntitlementCheckUnavailable',
    detail: 'The billing entitlement could not be checked',
    kind: 'problem',
    status: 503,
  },
  /** An API that never answers. */
  hang: { kind: 'hang' },
} as const satisfies Record<string, CapabilitiesOutage>;

export type BillingAppModelSeed = {
  /** What `GET /billing/capabilities` answers; billing on with NoOp by default. */
  capabilities?: BillingCapabilities;
};

export type SerializedBillingAppModel = {
  capabilities: BillingCapabilities;
  outage: CapabilitiesOutage | null;
};

/**
 * Billing as the Core API exposes it to the console. For now that is the
 * capabilities: whether billing answers at all, who can collect invoices and
 * which parts of the release ship, which every other billing screen gates on.
 * The subscriptions, invoices and settings of the screens that follow are
 * added to this model, so that what one screen changes shows on the others.
 */
export class BillingAppModel {
  private capabilities: BillingCapabilities;
  private outage: CapabilitiesOutage | null = null;

  static fromSerialized(state: SerializedBillingAppModel) {
    const model = new BillingAppModel({ capabilities: state.capabilities });
    model.outage = state.outage;
    return model;
  }

  serializeForMsw(): SerializedBillingAppModel {
    return {
      capabilities: clone(this.capabilities),
      outage: clone(this.outage),
    };
  }

  constructor(seed: BillingAppModelSeed = {}) {
    this.capabilities = parseContract(
      zBillingCapabilities,
      seed.capabilities ?? billingCapabilitiesProfiles.stack(),
      'BillingAppModel seed.capabilities',
    );
  }

  /** The body of `GET /billing/capabilities`, or the refusal the model is set to give. */
  getCapabilities(): BillingCapabilities {
    if (this.outage?.kind === 'problem') {
      throw new BillingProblem(
        this.outage.status,
        this.outage.code,
        this.outage.detail,
      );
    }
    return clone(this.capabilities);
  }

  /** Whether `GET /billing/capabilities` is set never to answer. */
  capabilitiesNeverAnswer(): boolean {
    return this.outage?.kind === 'hang';
  }

  setCapabilities(capabilities: BillingCapabilities) {
    this.capabilities = parseContract(
      zBillingCapabilities,
      capabilities,
      'BillingAppModel capabilities',
    );
  }

  /** Makes `GET /billing/capabilities` fail, until `restoreCapabilities`. */
  failCapabilities(outage: CapabilitiesOutage) {
    this.outage = outage;
  }

  restoreCapabilities() {
    this.outage = null;
  }
}
