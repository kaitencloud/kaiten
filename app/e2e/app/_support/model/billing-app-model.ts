import type { BillingCapabilities } from '@/api-client';
import { zBillingCapabilities } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import {
  AddonCatalogue,
  type AddonCatalogueSeed,
  type SerializedAddonCatalogue,
} from './billing-addon-catalogue';
import { billingCapabilitiesProfiles } from './billing-capabilities';
import {
  BillingInvoices,
  type BillingInvoicesSeed,
  type SerializedBillingInvoices,
} from './billing-invoices';
import { BillingProblem } from './billing-problem';
import {
  BillingProviders,
  type BillingProvidersSeed,
  type ProvidersHost,
  type SerializedBillingProviders,
} from './billing-providers';
import type { InstanceAddons } from './billing-instance-addons';
import {
  BillingPublishableKeys,
  type BillingPublishableKeysSeed,
  type SerializedBillingPublishableKeys,
} from './billing-publishable-keys';
import {
  BillingSubscriptions,
  type BillingSubscriptionsSeed,
  type SerializedBillingSubscriptions,
} from './billing-subscriptions';
import {
  BillingVouchers,
  type BillingVouchersSeed,
  type SerializedBillingVouchers,
} from './billing-vouchers';

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
    /** The add-on catalogue: its families, versions, grants, prices and the licenses they fit. */
    addonCatalogue?: AddonCatalogueSeed;
    /** What `GET /billing/capabilities` answers; billing on with NoOp by default. */
    capabilities?: BillingCapabilities;
    /** The customers as the payment provider holds them, the health of billing and the provider's pass. */
    providers?: BillingProvidersSeed;
    /** The publishable keys of the organization: the keys a web page reads the public catalogue with. */
    publishableKeys?: BillingPublishableKeysSeed;
    /** The vouchers of the organization and what instances redeemed of them. */
    voucherCatalogue?: BillingVouchersSeed;
  };

export type SerializedBillingAppModel = {
  /** The add-on catalogue; a state stored before it existed has none. */
  addonCatalogue?: SerializedAddonCatalogue;
  capabilities: BillingCapabilities;
  /** The invoices and their queue; a state stored before they existed has none. */
  invoices?: SerializedBillingInvoices;
  outage: CapabilitiesOutage | null;
  /** The payment provider's side; a state stored before it existed has none. */
  providers?: SerializedBillingProviders;
  /** The publishable keys; a state stored before they existed has none. */
  publishableKeys?: SerializedBillingPublishableKeys;
  /** The subscriptions and the billing defaults; a state stored before they existed has none. */
  subscriptions?: SerializedBillingSubscriptions;
  /** The vouchers and their redemptions; a state stored before they existed has none. */
  voucherCatalogue?: SerializedBillingVouchers;
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
  /** The catalogue of add-ons: families, versions, what they grant, what they cost, which licenses they fit. */
  addons: AddonCatalogue;
  /** The vouchers: the catalogue, what each instance redeemed, and the checks of a redemption. */
  vouchers: BillingVouchers;
  /** What the payment provider adds: its customers and their payment methods, the health and the pass that mirrors it. */
  providers: BillingProviders;
  /** The publishable keys: issued once, listed by their last four characters, edited and revoked. */
  publishableKeys: BillingPublishableKeys;
  /** The billing e-mail of a customer as the customers of the organization hold it, once the page serves them. */
  private emailOf: ((customerSlug: string) => string | undefined) | undefined;

  /** The add-ons the instances hold: attaching, quantities and removal, with the checks of the API. */
  get instanceAddons(): InstanceAddons {
    return this.subscriptions.instanceAddons;
  }

  static fromSerialized(state: SerializedBillingAppModel) {
    const model = new BillingAppModel({ capabilities: state.capabilities });
    model.outage = state.outage;
    if (state.providers) {
      model.providers = BillingProviders.fromSerialized(
        model.providersHost(),
        state.providers,
      );
    }
    if (state.invoices) {
      model.invoices = BillingInvoices.fromSerialized(state.invoices);
    }
    if (state.addonCatalogue) {
      model.addons = AddonCatalogue.fromSerialized(state.addonCatalogue);
    }
    if (state.voucherCatalogue) {
      model.vouchers = BillingVouchers.fromSerialized(state.voucherCatalogue);
    }
    if (state.publishableKeys) {
      model.publishableKeys = BillingPublishableKeys.fromSerialized(
        state.publishableKeys,
      );
    }
    model.subscriptions = state.subscriptions
      ? BillingSubscriptions.fromSerialized(
          model.invoices,
          state.subscriptions,
          undefined,
          model.addons,
          model.vouchers,
        )
      : new BillingSubscriptions(
          model.invoices,
          {},
          undefined,
          model.addons,
          model.vouchers,
        );
    model.wireProviders();
    return model;
  }

  serializeForMsw(): SerializedBillingAppModel {
    return {
      addonCatalogue: this.addons.serialize(),
      capabilities: clone(this.capabilities),
      invoices: this.invoices.serialize(),
      outage: clone(this.outage),
      providers: this.providers.serialize(),
      publishableKeys: this.publishableKeys.serialize(),
      subscriptions: this.subscriptions.serialize(),
      voucherCatalogue: this.vouchers.serialize(),
    };
  }

  constructor(seed: BillingAppModelSeed = {}) {
    this.capabilities = parseContract(
      zBillingCapabilities,
      seed.capabilities ?? billingCapabilitiesProfiles.stack(),
      'BillingAppModel seed.capabilities',
    );
    this.invoices = new BillingInvoices(seed);
    this.addons = new AddonCatalogue(seed.addonCatalogue);
    this.vouchers = new BillingVouchers(seed.voucherCatalogue);
    this.publishableKeys = new BillingPublishableKeys(seed.publishableKeys);
    this.subscriptions = new BillingSubscriptions(
      this.invoices,
      seed,
      undefined,
      this.addons,
      this.vouchers,
    );
    this.providers = new BillingProviders(this.providersHost(), seed.providers);
    this.wireProviders();
  }

  /** What the model of the providers reads of the rest of billing; read at each call, so that what replaces a part is seen. */
  private providersHost(): ProvidersHost {
    return {
      capabilities: () => this.capabilities,
      emailOf: (customerSlug) => this.emailOf?.(customerSlug),
      invoices: () => this.invoices,
      now: () => Date.now(),
      subscriptions: () => this.subscriptions.snapshot(),
    };
  }

  /** Gives the subscriptions the world a move to a payment provider is checked against. */
  private wireProviders() {
    this.subscriptions.setProviderRules(() => this.providers.rules());
  }

  /**
   * Tells the model where the billing e-mail of a customer is read when the
   * customers of the organization are served alongside, so that an address
   * typed on the customer's page is the one a move to Stripe finds.
   */
  setEmailSource(emailOf: (customerSlug: string) => string | undefined) {
    this.emailOf = emailOf;
  }

  /**
   * Stripe's connector was activated or deactivated: the capabilities say it, and
   * which account it reaches. The capabilities have no Stripe entry when the
   * profile does not list one, and nothing changes then.
   */
  setStripeConnection(connected: boolean, livemode = false) {
    const providers = this.capabilities.providers.map((provider) =>
      provider.kind === 'STRIPE'
        ? {
            ...provider,
            connected,
            livemode: connected ? livemode : undefined,
          }
        : provider,
    );
    this.capabilities = parseContract(
      zBillingCapabilities,
      { ...this.capabilities, providers },
      'BillingAppModel Stripe connection',
    );
  }

  /** Whether the organization may connect Stripe here, as the capabilities say it, and why not. */
  stripeStanding(): 'available' | 'notEntitled' | 'vaultMissing' {
    const stripe = this.capabilities.providers.find(
      ({ kind }) => kind === 'STRIPE',
    );
    if (!stripe || stripe.connected || stripe.available) {
      return 'available';
    }

    return stripe.unavailableReason === 'VAULT_NOT_CONFIGURED'
      ? 'vaultMissing'
      : 'notEntitled';
  }

  /** How many subscriptions and unsettled invoices route to Stripe: what keeps it from being disconnected. */
  stripeRouting(): { activeSubscriptions: number; openInvoices: number } {
    const unsettled = ['DRAFT', 'PUSHED', 'PUSH_FAILED', 'PAYMENT_FAILED'];

    return {
      activeSubscriptions: this.subscriptions
        .snapshot()
        .filter(
          (subscription) =>
            subscription.providerKind === 'STRIPE' &&
            subscription.status !== 'CANCELED',
        ).length,
      openInvoices: this.invoices
        .snapshot()
        .filter(
          (invoice) =>
            invoice.providerKind === 'STRIPE' &&
            unsettled.includes(invoice.status),
        ).length,
    };
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
