import type {
  BillingCapabilities,
  BillingHealth,
  CompletedPaymentMethodSession,
  CustomerBilling,
  InstanceBilling,
  NewPaymentMethodSession,
  NewPortalSession,
  PaymentMethodLabels,
  PaymentMethodSession,
  PortalSession,
  ProviderSync,
  SyncReport,
} from '@/api-client';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import type { BillingInvoices } from './billing-invoices';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** The failed pushes of one invoice after which the health of billing counts it. */
const PUSH_ALERT_AFTER_ATTEMPTS = 5;
/** Currencies Stripe does not take: its special cases and the three-decimal ones. */
const REFUSED_CURRENCIES = [
  'BHD',
  'HUF',
  'ISK',
  'JOD',
  'KWD',
  'OMR',
  'TND',
  'TWD',
  'UGX',
];

/** What the mocks arm to fail with a problem document, once. */
export type ProviderProblemOperation =
  | 'completePaymentMethodSession'
  | 'createPaymentMethodSession'
  | 'createPortalSession'
  | 'detachPaymentMethod'
  | 'getBillingHealth'
  | 'getCustomerBilling'
  | 'syncBillingProvider';

/** A customer as the payment provider holds it. */
export type ProviderCustomer = {
  /** Where the customer's invoices go: the billing slot's copy, when the customers are not served alongside. */
  billingEmail?: string;
  /** Set once the provider knows the customer: a push, a switch or a session registered it. */
  externalCustomerId?: string;
  /** Its default payment method; none when there is none. */
  paymentMethod?: PaymentMethodLabels;
  syncedAt?: string;
};

/** A hosted setup page a customer was sent to, and how it ended there. */
export type SetupSession = {
  /** When the session was completed: a second completion leaves the method as it is. */
  completedAt?: string;
  customerSlug: string;
  /** `complete`: the customer saved a method. `incomplete`: they left the page without. */
  outcome: 'complete' | 'incomplete';
  /** The method the customer saved, when they did; a Visa ending 4242 otherwise. */
  paymentMethod?: Partial<PaymentMethodLabels>;
};

/** Where the provider's periodic pass stands. */
export type ProviderSyncState = {
  consecutiveFailures: number;
  lastFullSweepAt?: string;
  lastSyncError?: string;
  lastSyncStatus?: 'FAILED' | 'PARTIAL' | 'SUCCESS';
  lastSyncedAt?: string;
};

export type BillingProvidersSeed = {
  customers?: Record<string, ProviderCustomer>;
  /** What `GET /billing/health` answers, whatever the invoices say; computed from them when left out. */
  health?: BillingHealth;
  sessions?: Record<string, SetupSession>;
  sync?: ProviderSyncState;
};

export type SerializedBillingProviders = {
  armedProblems: Array<[ProviderProblemOperation, ArmedBillingProblem]>;
  customers: Record<string, ProviderCustomer>;
  health: BillingHealth | null;
  sequence: number;
  sessions: Record<string, SetupSession>;
  sync: ProviderSyncState | null;
};

/** What the model reads of the rest of billing. */
export type ProvidersHost = {
  /** The capabilities as served now: the Stripe entry says whether it is connected. */
  capabilities: () => BillingCapabilities;
  /** The customer's billing e-mail as the customers of the organization hold it, when they are served alongside. */
  emailOf?: (customerSlug: string) => string | undefined;
  invoices: () => BillingInvoices;
  now: () => number;
  /** The subscriptions of the organization: what is charged to a customer, and which periods are waiting to close. */
  subscriptions: () => InstanceBilling[];
};

/**
 * What a move to a provider checks of the world, as the API checks it
 * (updateinstancebilling): whether the provider is connected and what it can do,
 * the customer it would register, and the registration itself.
 */
export type ProviderRules = {
  acceptsCurrency: (currency: string) => boolean;
  /** The capabilities of a provider, once it is connected. */
  connection: (
    kind: 'NOOP' | 'STRIPE',
  ) => { automaticCollection: boolean } | undefined;
  customer: (customerSlug: string) => {
    billingEmail?: string;
    hasUsablePaymentMethod: boolean;
  };
  /** Registers the customer with the provider, which is a call that can fail. */
  ensureCustomer: (customerSlug: string) => void;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);

    return (
      value.length <= 2048 &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          (url.hostname === 'localhost' || url.hostname === '127.0.0.1')))
    );
  } catch {
    return false;
  }
};

const plusYears = (instant: number, years: number) =>
  new Date(instant).getUTCFullYear() + years;

/**
 * What the payment provider adds to billing, as the Core API serves it
 * (api/internal/modules/billing: getcustomerbilling, createpaymentmethodsession,
 * completepaymentmethodsession, createportalsession, detachpaymentmethod,
 * getbillinghealth, syncprovider): the customers it holds with their payment
 * methods, the hosted pages a customer is sent to, the health of billing and the
 * pass that mirrors the provider. It refuses with the codes and in the order the
 * API does, so that the console is exercised against the reasons it will really be
 * given. What the provider does to an invoice is the invoices' own
 * (`BillingInvoices.retryPush`, `syncInvoice`).
 */
export class BillingProviders {
  private readonly problems = new ArmedProblems<ProviderProblemOperation>();
  private customers: Record<string, ProviderCustomer>;
  private health: BillingHealth | null;
  private sequence = 1;
  private sessions: Record<string, SetupSession>;
  private sync: ProviderSyncState | null;

  constructor(
    private readonly host: ProvidersHost,
    seed: BillingProvidersSeed = {},
  ) {
    this.customers = clone(seed.customers ?? {});
    this.health = seed.health ? clone(seed.health) : null;
    this.sessions = clone(seed.sessions ?? {});
    this.sync = seed.sync ? clone(seed.sync) : null;
  }

  static fromSerialized(
    host: ProvidersHost,
    state: SerializedBillingProviders,
  ): BillingProviders {
    const model = new BillingProviders(host, {
      customers: state.customers,
      health: state.health ?? undefined,
      sessions: state.sessions,
      sync: state.sync ?? undefined,
    });
    model.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingProviders {
    return {
      armedProblems: this.problems.serialize(),
      customers: clone(this.customers),
      health: clone(this.health),
      sequence: this.sequence,
      sessions: clone(this.sessions),
      sync: clone(this.sync),
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(
    operation: ProviderProblemOperation,
    problem: ArmedBillingProblem,
  ) {
    this.problems.arm(operation, problem);
  }

  /** Tells the model how a hosted page ended, or that it exists: a spec sends the customer there. */
  setSession(sessionId: string, session: SetupSession) {
    this.sessions[sessionId] = clone(session);
  }

  /** Replaces what `GET /billing/health` answers; `null` goes back to counting the invoices. */
  setHealth(health: BillingHealth | null) {
    this.health = health ? clone(health) : null;
  }

  /** Replaces where the periodic pass stands. */
  setSyncState(sync: ProviderSyncState | null) {
    this.sync = sync ? clone(sync) : null;
  }

  /** Puts a customer's payment method in the provider, as a spec's setup. */
  setPaymentMethod(
    customerSlug: string,
    paymentMethod: PaymentMethodLabels | null,
  ) {
    const customer = this.customerOf(customerSlug);
    customer.externalCustomerId ??= this.externalIdOf(customerSlug);
    customer.paymentMethod = paymentMethod ?? undefined;
    customer.syncedAt = new Date(this.host.now()).toISOString();
  }

  /** Whether the provider holds a customer of the organization: a key of another account would orphan them. */
  hasCustomers(): boolean {
    return Object.values(this.customers).some(
      (customer) => customer.externalCustomerId !== undefined,
    );
  }

  /** The customer as the provider holds it, for a spec that asserts what the model holds. */
  snapshot(customerSlug: string): ProviderCustomer | undefined {
    return this.customers[customerSlug]
      ? clone(this.customers[customerSlug])
      : undefined;
  }

  // --- What a move to the provider checks ------------------------------------

  rules(): ProviderRules {
    return {
      acceptsCurrency: (currency) => !REFUSED_CURRENCIES.includes(currency),
      connection: (kind) => {
        const provider = this.host
          .capabilities()
          .providers.find((candidate) => candidate.kind === kind);

        return provider?.connected
          ? { automaticCollection: provider.capabilities.automaticCollection }
          : undefined;
      },
      customer: (customerSlug) => {
        const customer = this.customers[customerSlug];

        return {
          billingEmail: this.emailOf(customerSlug),
          hasUsablePaymentMethod: customer?.paymentMethod?.status === 'ACTIVE',
        };
      },
      ensureCustomer: (customerSlug) => {
        const customer = this.customerOf(customerSlug);
        customer.externalCustomerId ??= this.externalIdOf(customerSlug);
      },
    };
  }

  private emailOf(customerSlug: string): string | undefined {
    return (
      this.host.emailOf?.(customerSlug) ??
      this.customers[customerSlug]?.billingEmail
    );
  }

  private customerOf(customerSlug: string): ProviderCustomer {
    this.customers[customerSlug] ??= {};

    return this.customers[customerSlug];
  }

  private externalIdOf(customerSlug: string) {
    return `cus_${customerSlug.replace(/[^a-z0-9]/gi, '')}`;
  }

  private isStripeConnected(): boolean {
    return Boolean(
      this.host.capabilities().providers.find(({ kind }) => kind === 'STRIPE')
        ?.connected,
    );
  }

  private requireStripe(operation: string) {
    if (!this.isStripeConnected()) {
      throw new BillingProblem(
        422,
        `${operation}.ProviderNotConnected`,
        'no payment provider that saves payment methods is connected for this organization',
      );
    }
  }

  private knowsCustomer(customerSlug: string): boolean {
    return (
      customerSlug in this.customers ||
      this.host
        .subscriptions()
        .some((subscription) => subscription.customerSlug === customerSlug)
    );
  }

  private requireCustomer(operation: string, customerSlug: string) {
    if (!this.knowsCustomer(customerSlug)) {
      throw new BillingProblem(
        404,
        `${operation}.CustomerNotFound`,
        `customer "${customerSlug}" not found`,
      );
    }
  }

  /** The live Stripe subscriptions of a customer. */
  private liveSubscriptionsOf(customerSlug: string): InstanceBilling[] {
    return this.host
      .subscriptions()
      .filter(
        (subscription) =>
          subscription.customerSlug === customerSlug &&
          subscription.status !== 'CANCELED' &&
          subscription.providerKind === 'STRIPE',
      );
  }

  // --- A customer's payment method --------------------------------------------

  /** `GET /customers/{customerSlug}/billing`. */
  getCustomerBilling(customerSlug: string): CustomerBilling {
    this.problems.consume('getCustomerBilling');
    this.requireCustomer('GetCustomerBilling', customerSlug);
    const customer = this.customers[customerSlug];
    const externalCustomerId = customer?.externalCustomerId;

    // The API sends `paymentMethod: null` for a customer with none, which its
    // contract declares non-null: the body is what the API puts on the wire.
    return {
      billingEmail: this.emailOf(customerSlug),
      providers: externalCustomerId
        ? [
            {
              externalCustomerId,
              paymentMethod: customer.paymentMethod
                ? clone(customer.paymentMethod)
                : null,
              providerKind: 'STRIPE',
              syncedAt: customer.syncedAt,
              webUrl: `https://dashboard.stripe.com/test/customers/${externalCustomerId}`,
            },
          ]
        : [],
    } as unknown as CustomerBilling;
  }

  /** `POST /customers/{customerSlug}/billing/payment-method-session`. */
  createPaymentMethodSession(
    customerSlug: string,
    body: NewPaymentMethodSession,
  ): PaymentMethodSession {
    const operation = 'CreatePaymentMethodSession';
    this.problems.consume('createPaymentMethodSession');
    this.requireCustomer(operation, customerSlug);
    this.requireStripe(operation);
    if (!isHttpUrl(body.returnUrl)) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidReturnUrl`,
        'returnUrl must be an https URL (or http on localhost) of at most 2048 characters',
      );
    }
    // The subscription's currency is the method's; without one the caller names it.
    if (this.liveSubscriptionsOf(customerSlug).length === 0 && !body.currency) {
      throw new BillingProblem(
        422,
        `${operation}.CurrencyRequired`,
        'the customer has no live subscription: name the currency the payment method is set up in',
        {
          errors: [
            {
              location: 'body.currency',
              message: 'required without a live subscription',
            },
          ],
        },
      );
    }
    this.rules().ensureCustomer(customerSlug);
    const sessionId = `cs_test_${String(this.sequence).padStart(4, '0')}`;
    this.sequence += 1;
    this.sessions[sessionId] = { customerSlug, outcome: 'complete' };

    return {
      expiresAt: new Date(this.host.now() + SESSION_LIFETIME_MS).toISOString(),
      sessionId,
      url: `https://checkout.stripe.com/c/pay/${sessionId}`,
    };
  }

  /** `POST /customers/{customerSlug}/billing/payment-method-session/{sessionId}/complete`. */
  completePaymentMethodSession(
    customerSlug: string,
    sessionId: string,
  ): CompletedPaymentMethodSession {
    const operation = 'CompletePaymentMethodSession';
    this.problems.consume('completePaymentMethodSession');
    this.requireCustomer(operation, customerSlug);
    this.requireStripe(operation);
    const session = this.sessions[sessionId];
    if (!session || session.customerSlug !== customerSlug) {
      throw new BillingProblem(
        404,
        `${operation}.SessionNotFound`,
        `the setup session "${sessionId}" is unknown, or another customer's`,
      );
    }
    if (session.outcome !== 'complete') {
      throw new BillingProblem(
        409,
        `${operation}.SessionNotComplete`,
        'the customer has not finished saving a payment method on the provider page',
      );
    }
    const customer = this.customerOf(customerSlug);
    const now = this.host.now();
    customer.externalCustomerId ??= this.externalIdOf(customerSlug);
    // The method of the session becomes the customer's default, replacing another;
    // a second completion of the same session finds it done.
    if (!session.completedAt || !customer.paymentMethod) {
      session.completedAt = new Date(now).toISOString();
      customer.paymentMethod = {
        attachedAt: new Date(now).toISOString(),
        brand: 'visa',
        expMonth: 12,
        expYear: plusYears(now, 3),
        last4: '4242',
        ...session.paymentMethod,
        status: 'ACTIVE',
      };
    }
    customer.syncedAt = new Date(now).toISOString();

    return { paymentMethod: clone(customer.paymentMethod) };
  }

  /** `POST /customers/{customerSlug}/billing/portal-session`. */
  createPortalSession(
    customerSlug: string,
    body: NewPortalSession,
  ): PortalSession {
    const operation = 'CreatePortalSession';
    this.problems.consume('createPortalSession');
    this.requireCustomer(operation, customerSlug);
    this.requireStripe(operation);
    if (!isHttpUrl(body.returnUrl)) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidReturnUrl`,
        'returnUrl must be an https URL (or http on localhost) of at most 2048 characters',
      );
    }
    const customer = this.customers[customerSlug];
    if (!customer?.externalCustomerId) {
      throw new BillingProblem(
        422,
        `${operation}.CustomerNotOnProvider`,
        'the customer is not in the payment provider yet: save a payment method or push one of its invoices first',
      );
    }

    return {
      url: `https://billing.stripe.com/p/session/bps_${customer.externalCustomerId}`,
    };
  }

  /** `DELETE /customers/{customerSlug}/billing/payment-method`. */
  detachPaymentMethod(customerSlug: string): void {
    const operation = 'DetachPaymentMethod';
    this.problems.consume('detachPaymentMethod');
    this.requireCustomer(operation, customerSlug);
    this.requireStripe(operation);
    const customer = this.customers[customerSlug];
    if (!customer?.paymentMethod) {
      throw new BillingProblem(
        409,
        `${operation}.NoPaymentMethod`,
        'the customer has no payment method to remove',
      );
    }
    const charged = this.liveSubscriptionsOf(customerSlug).filter(
      (subscription) =>
        subscription.collectionMethod === 'CHARGE_AUTOMATICALLY',
    );
    if (charged.length > 0) {
      throw new BillingProblem(
        409,
        `${operation}.InUseByAutomaticCollection`,
        'a live subscription of the customer is charged automatically: switch it to SEND_INVOICE first',
      );
    }
    customer.paymentMethod = undefined;
    customer.syncedAt = new Date(this.host.now()).toISOString();
  }

  // --- Health and the pass that mirrors the provider -----------------------------

  /** `GET /billing/health`: counted from the invoices and the subscriptions when no spec set it. */
  getHealth(): BillingHealth {
    this.problems.consume('getBillingHealth');
    if (this.health) {
      return clone(this.health);
    }
    const now = this.host.now();
    const invoices = this.host.invoices().snapshot();
    const subscriptions = this.host.subscriptions();
    const oldest = (instants: Array<string | undefined>) => {
      const known = instants.filter(
        (instant): instant is string => instant !== undefined,
      );

      return known.length > 0
        ? known.reduce((first, next) =>
            Date.parse(next) < Date.parse(first) ? next : first,
          )
        : undefined;
    };
    const waitingToClose = subscriptions.filter(
      (subscription) =>
        subscription.status !== 'CANCELED' &&
        Date.parse(subscription.currentPeriodEnd) <= now,
    );
    const held = invoices.filter(
      (invoice) => invoice.status === 'DRAFT' && invoice.holdReason,
    );
    const heldBy = (reason: string) =>
      held.filter((invoice) => invoice.holdReason === reason).length;
    const failed = invoices.filter(
      (invoice) =>
        invoice.status === 'PUSH_FAILED' &&
        (invoice.provider?.pushAttempts ?? 0) >= PUSH_ALERT_AFTER_ATTEMPTS,
    );
    const mismatched = invoices.filter(
      (invoice) =>
        invoice.provider?.reconciliationStatus === 'MISMATCH' &&
        now - Date.parse(invoice.provider.reconciledAt ?? invoice.createdAt) <=
          30 * DAY_MS,
    );
    const overdue = this.host.invoices().matching({ overdue: true });
    const waiting = invoices.filter(
      (invoice) => invoice.handoffStatus === 'PENDING',
    );

    return {
      closeBacklog: {
        count: waitingToClose.length,
        oldestDueAt: oldest(
          waitingToClose.map((subscription) => subscription.currentPeriodEnd),
        ),
      },
      handoff: {
        oldestPendingIssuedAt: oldest(
          waiting.map((invoice) => invoice.issuedAt),
        ),
        pending: waiting.length,
      },
      heldInvoices: {
        byReason: {
          LEDGER_CHAIN_BREAK: heldBy('LEDGER_CHAIN_BREAK'),
          LEDGER_COUNTER_MISMATCH: heldBy('LEDGER_COUNTER_MISMATCH'),
          LEDGER_SEQUENCE_GAP: heldBy('LEDGER_SEQUENCE_GAP'),
        },
        count: held.length,
      },
      overdueInvoices: overdue.length,
      pastDueSubscriptions: subscriptions.filter(
        (subscription) => subscription.status === 'PAST_DUE',
      ).length,
      providerSync: this.providerSync(now),
      pushFailures: {
        count: failed.length,
        oldestFailedAt: oldest(failed.map((invoice) => invoice.updatedAt)),
      },
      reconciliationMismatches30d: mismatched.length,
    };
  }

  private providerSync(now: number): ProviderSync[] {
    if (!this.sync) {
      return [];
    }

    return [
      {
        consecutiveFailures: this.sync.consecutiveFailures,
        lagSeconds: this.sync.lastSyncedAt
          ? Math.max(
              0,
              Math.round((now - Date.parse(this.sync.lastSyncedAt)) / 1000),
            )
          : undefined,
        lastFullSweepAt: this.sync.lastFullSweepAt,
        lastSyncError: this.sync.lastSyncError,
        lastSyncStatus: this.sync.lastSyncStatus,
        lastSyncedAt: this.sync.lastSyncedAt,
        providerKind: 'STRIPE',
      },
    ];
  }

  /**
   * `POST /billing/sync`: one pass now for each connected provider that issues
   * invoices. It reads every invoice the provider holds open and applies what the
   * provider says, as the periodic pass does.
   */
  syncProvider(): SyncReport {
    this.problems.consume('syncBillingProvider');
    if (!this.isStripeConnected()) {
      throw new BillingProblem(
        409,
        'SyncProvider.NotConnected',
        'no payment provider that issues invoices is connected',
      );
    }
    const at = new Date(this.host.now()).toISOString();
    const { applied, failed } = this.host.invoices().syncOpenProviderInvoices();
    this.sync = {
      consecutiveFailures: 0,
      lastFullSweepAt: at,
      lastSyncStatus: failed > 0 ? 'PARTIAL' : 'SUCCESS',
      lastSyncedAt: at,
    };

    return {
      providers: [
        {
          applied,
          failed,
          providerKind: 'STRIPE',
          status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
          syncedAt: at,
        },
      ],
    };
  }
}
