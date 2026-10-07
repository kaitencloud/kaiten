import type { BillingCapabilities } from '@/api-client';
import { zBillingCapabilities } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { billingCapabilitiesProfiles } from './billing-capabilities';
import {
  BillingInvoices,
  type BillingInvoicesSeed,
  type SerializedBillingInvoices,
} from './billing-invoices';
import { BillingProblem } from './billing-problem';
import {
  BillingSubscriptions,
  type BillingSubscriptionsSeed,
  type SerializedBillingSubscriptions,
} from './billing-subscriptions';

export { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

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

export type BillingAppModelSeed = BillingInvoicesSeed &
  BillingSubscriptionsSeed & {
    /** What `GET /billing/capabilities` answers; billing on with NoOp by default. */
    capabilities?: BillingCapabilities;
  };

export type SerializedBillingAppModel = {
  capabilities: BillingCapabilities;
  /** The invoices and their queue; a state stored before they existed has none. */
  invoices?: SerializedBillingInvoices;
  outage: CapabilitiesOutage | null;
  /** The subscriptions and the billing defaults; a state stored before they existed has none. */
  subscriptions?: SerializedBillingSubscriptions;
};

/**
 * Billing as the Core API exposes it to the console: the capabilities every
 * billing screen gates on (whether billing answers at all, who can collect
 * invoices, which parts of the release ship), the invoices of the organization
 * with their handoff queue, and the subscriptions of its instances with the
 * billing defaults. They are one model, so that what one screen changes shows
 * on the others: a subscribe issues an invoice the list of invoices then shows.
 */
export class BillingAppModel {
  private capabilities: BillingCapabilities;
  private outage: CapabilitiesOutage | null = null;
  /** The invoices, the handoff queue and the usage behind the metered lines. */
  invoices: BillingInvoices;
  /** The subscriptions of the instances, what they will issue next and the billing defaults. */
  subscriptions: BillingSubscriptions;

  static fromSerialized(state: SerializedBillingAppModel) {
    const model = new BillingAppModel({ capabilities: state.capabilities });
    model.outage = state.outage;
    if (state.invoices) {
      model.invoices = BillingInvoices.fromSerialized(state.invoices);
    }
    model.subscriptions = state.subscriptions
      ? BillingSubscriptions.fromSerialized(model.invoices, state.subscriptions)
      : new BillingSubscriptions(model.invoices);
    return model;
  }

  serializeForMsw(): SerializedBillingAppModel {
    return {
      capabilities: clone(this.capabilities),
      invoices: this.invoices.serialize(),
      outage: clone(this.outage),
      subscriptions: this.subscriptions.serialize(),
    };
  }

  constructor(seed: BillingAppModelSeed = {}) {
    this.capabilities = parseContract(
      zBillingCapabilities,
      seed.capabilities ?? billingCapabilitiesProfiles.stack(),
      'BillingAppModel seed.capabilities',
    );
    this.invoices = new BillingInvoices(seed);
    this.subscriptions = new BillingSubscriptions(this.invoices, seed);
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
