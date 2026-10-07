import { z } from 'zod';
import type {
  BillingSettings,
  InstanceBilling,
  Invoice,
  InvoiceLine,
  InvoicePreview,
  NewSubscription,
  PageInvoiceSummary,
  Price,
  StartedSubscription,
} from '@/api-client';
import {
  zBillingSettings,
  zInstanceBilling,
  zInvoicePreview,
  zPrice,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { buildInvoice, buildInvoiceLine } from '../fixtures/build-invoice';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import {
  type BillingInvoices,
  type InvoiceListQuery,
  toSummary,
} from './billing-invoices';
import { BillingProblem } from './billing-problem';
import { addMonthsClamped } from './license-invoice-preview';

const clone = <T>(value: T): T => structuredClone(value);

const PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const;

/** Where the API puts the default terms of an organization that never wrote any. */
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  defaultCollectionMethod: 'SEND_INVOICE',
  defaultDaysUntilDue: 30,
  handoffStripeInvoices: false,
};

/** What the mocks arm to fail with a problem document, once. */
export type SubscriptionProblemOperation =
  | 'getBillingSettings'
  | 'getInstanceBilling'
  | 'getUpcomingInvoice'
  | 'listInstanceInvoices'
  | 'subscribeInstance'
  | 'updateBillingSettings';

/** An instance as the subscription of a mock sees it: who it is for, and the version it is on. */
export type SubscribableInstance = {
  customerName: string;
  customerSlug: string;
  instanceName: string;
  instanceSlug: string;
  licenseId: string;
  licenseSlug: string;
  /** Only a PUBLISHED version can be subscribed to. */
  licenseState: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';
};

/**
 * What the billing slot knows of the rest of the organization, so that it can
 * answer a subscribe as the API does without the slots of the instances and the
 * licenses: the instances that exist and the prices of their versions. A slot
 * keeps its own copy of what it needs, as every other slot does.
 */
export type BillingCatalogue = {
  instances: SubscribableInstance[];
  /** The prices of each license version, by the slug of the version. */
  prices: Record<string, Price[]>;
};

export type BillingSubscriptionsSeed = {
  catalogue?: BillingCatalogue;
  settings?: BillingSettings;
  subscriptions?: InstanceBilling[];
  /** The invoice each subscription's next boundary will issue; one that is not listed is composed from its base price. */
  upcoming?: Record<string, InvoicePreview>;
};

export type SerializedBillingSubscriptions = {
  armedProblems: Array<[SubscriptionProblemOperation, ArmedBillingProblem]>;
  catalogue: BillingCatalogue;
  sequence: number;
  settings: BillingSettings;
  subscriptions: InstanceBilling[];
  upcoming: Record<string, InvoicePreview>;
};

/**
 * The subscriptions of the instances, the billing defaults of the organization
 * and the invoices a subscription issues, as the Core API serves them
 * (api/internal/modules/billing/subscribeinstance, getinstancebilling,
 * getupcominginvoice, listinstanceinvoices, getbillingsettings): the same
 * refusals with the same codes, so that the console is exercised against the
 * reasons it will really be given. A subscribe changes what the other reads
 * answer, and issues the activation invoice into the model of the invoices.
 */
export class BillingSubscriptions {
  private readonly problems = new ArmedProblems<SubscriptionProblemOperation>();
  private catalogue: BillingCatalogue;
  private sequence = 1;
  private settings: BillingSettings;
  private subscriptions: InstanceBilling[];
  private upcoming: Record<string, InvoicePreview>;

  constructor(
    private readonly invoices: BillingInvoices,
    seed: BillingSubscriptionsSeed = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.catalogue = clone(seed.catalogue ?? { instances: [], prices: {} });
    for (const [licenseSlug, prices] of Object.entries(this.catalogue.prices)) {
      parseContract(
        z.array(zPrice),
        prices,
        `BillingSubscriptions seed.catalogue.prices[${licenseSlug}]`,
      );
    }
    this.settings = parseContract(
      zBillingSettings,
      seed.settings ?? DEFAULT_BILLING_SETTINGS,
      'BillingSubscriptions seed.settings',
    );
    this.subscriptions = parseContract(
      z.array(zInstanceBilling),
      seed.subscriptions ?? [],
      'BillingSubscriptions seed.subscriptions',
    ).map(clone);
    this.upcoming = Object.fromEntries(
      Object.entries(seed.upcoming ?? {}).map(([slug, preview]) => [
        slug,
        parseContract(
          zInvoicePreview,
          preview,
          `BillingSubscriptions seed.upcoming[${slug}]`,
        ),
      ]),
    );
    this.invoices.setDefaultDaysUntilDue(this.settings.defaultDaysUntilDue);
  }

  static fromSerialized(
    invoices: BillingInvoices,
    state: SerializedBillingSubscriptions,
    now?: () => number,
  ): BillingSubscriptions {
    const model = new BillingSubscriptions(
      invoices,
      {
        catalogue: state.catalogue,
        settings: state.settings,
        subscriptions: state.subscriptions,
        upcoming: state.upcoming,
      },
      now,
    );
    model.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingSubscriptions {
    return {
      armedProblems: this.problems.serialize(),
      catalogue: clone(this.catalogue),
      sequence: this.sequence,
      settings: clone(this.settings),
      subscriptions: clone(this.subscriptions),
      upcoming: clone(this.upcoming),
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(
    operation: SubscriptionProblemOperation,
    problem: ArmedBillingProblem,
  ) {
    this.problems.arm(operation, problem);
  }

  /** Every subscription, for a spec that asserts what the model holds. */
  snapshot(): InstanceBilling[] {
    return clone(this.subscriptions);
  }

  /** Sets what an instance's next boundary will issue, for a spec that wants a particular preview. */
  setUpcoming(instanceSlug: string, preview: InvoicePreview) {
    this.upcoming[instanceSlug] = parseContract(
      zInvoicePreview,
      preview,
      `BillingSubscriptions upcoming[${instanceSlug}]`,
    );
  }

  private instance(slug: string): SubscribableInstance | undefined {
    return this.catalogue.instances.find(
      (candidate) => candidate.instanceSlug === slug,
    );
  }

  private subscriptionOf(slug: string): InstanceBilling | undefined {
    return this.subscriptions.find(
      (candidate) => candidate.instanceSlug === slug,
    );
  }

  private isKnown(slug: string): boolean {
    return (
      this.instance(slug) !== undefined ||
      this.subscriptionOf(slug) !== undefined
    );
  }

  // --- Reads ----------------------------------------------------------------

  /** `GET /instances/{instanceSlug}/billing`: the subscription, live or CANCELED; 404 when never subscribed. */
  getInstanceBilling(slug: string): InstanceBilling {
    this.problems.consume('getInstanceBilling');
    const subscription = this.subscriptionOf(slug);
    if (!subscription) {
      throw new BillingProblem(
        404,
        'GetInstanceBilling.NotFound',
        `instance "${slug}" has no subscription`,
      );
    }

    return clone(subscription);
  }

  /** `GET /instances/{instanceSlug}/billing/upcoming-invoice`. */
  getUpcomingInvoice(slug: string): InvoicePreview {
    this.problems.consume('getUpcomingInvoice');
    const subscription = this.subscriptionOf(slug);
    if (!subscription) {
      throw new BillingProblem(
        404,
        'GetUpcomingInvoice.NotFound',
        `instance "${slug}" has no subscription`,
      );
    }
    if (subscription.status === 'CANCELED') {
      throw new BillingProblem(
        409,
        'GetUpcomingInvoice.NotActive',
        'the subscription is canceled: it has no upcoming invoice',
      );
    }

    return clone(this.upcoming[slug] ?? this.composeUpcoming(subscription));
  }

  /**
   * What the next boundary issues when nothing says otherwise: the base fee, for
   * the period that starts when the current one ends if it bills in advance, and
   * for the one that ends if it bills in arrears.
   */
  private composeUpcoming(subscription: InstanceBilling): InvoicePreview {
    const { basePrice } = subscription;
    const months = PERIOD_MONTHS[subscription.billingPeriod];
    const boundary = subscription.currentPeriodEnd;
    const inAdvance = basePrice.billingTiming === 'ADVANCE';
    const from = inAdvance ? boundary : subscription.currentPeriodStart;
    const to = inAdvance
      ? addMonthsClamped(new Date(boundary), months).toISOString()
      : boundary;
    const amount = Math.round(Number(basePrice.unitAmountDecimal));
    const line = buildInvoiceLine({
      amount,
      description: `1 × ${basePrice.unitAmountDecimal} per ${subscription.billingPeriod.toLowerCase()}`,
      invoiceId: 'upcoming',
      label: basePrice.displayLabel ?? 'Base fee',
      seq: 1,
      serviceFrom: from,
      serviceTo: to,
      type: 'BASE',
      unitAmountDecimal: basePrice.unitAmountDecimal,
    });
    const instance = this.instance(subscription.instanceSlug);

    return parseContract(
      zInvoicePreview,
      {
        asOf: new Date(this.now()).toISOString(),
        boundaryAt: boundary,
        currency: subscription.currency,
        discountTotal: 0,
        kind: 'RENEWAL',
        licenseSlug: instance?.licenseSlug ?? '',
        lines: [line],
        serviceFrom: from,
        serviceTo: to,
        status: 'PREVIEW',
        subtotal: amount,
        total: amount,
        wouldHold: [],
      },
      'BillingSubscriptions upcoming invoice',
    );
  }

  /** `GET /instances/{instanceSlug}/invoices`: the invoices of the subscription, across every time it was subscribed. */
  listInstanceInvoices(
    slug: string,
    query: InvoiceListQuery,
  ): PageInvoiceSummary {
    this.problems.consume('listInstanceInvoices');
    if (!this.isKnown(slug)) {
      throw new BillingProblem(
        404,
        'ListInstanceInvoices.InstanceNotFound',
        `instance "${slug}" not found`,
      );
    }
    if (!this.subscriptionOf(slug)) {
      return { hasMore: false, items: [] };
    }

    return this.invoices.listInvoices({ ...query, instanceSlug: slug });
  }

  /** `GET /licenses/{licenseSlug}/prices`, for the slots that do not own the licenses. */
  listPrices(
    licenseSlug: string,
    filter: { billingModel?: Price['billingModel']; status?: Price['status'] },
  ): Price[] {
    return clone(
      (this.catalogue.prices[licenseSlug] ?? [])
        .filter(
          (price) =>
            (!filter.status || price.status === filter.status) &&
            (!filter.billingModel ||
              price.billingModel === filter.billingModel),
        )
        .sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.id.localeCompare(right.id),
        ),
    );
  }

  // --- Settings ---------------------------------------------------------------

  /** `GET /billing/settings`. */
  getSettings(): BillingSettings {
    this.problems.consume('getBillingSettings');

    return clone(this.settings);
  }

  /** `PUT /billing/settings`: replaces the three members. */
  updateSettings(body: BillingSettings): BillingSettings {
    this.problems.consume('updateBillingSettings');
    if (body.defaultDaysUntilDue < 0 || body.defaultDaysUntilDue > 365) {
      throw new BillingProblem(
        422,
        'UpdateBillingSettings.InvalidDaysUntilDue',
        'defaultDaysUntilDue is between 0 and 365',
      );
    }
    if (body.defaultCollectionMethod !== 'SEND_INVOICE') {
      throw new BillingProblem(
        422,
        'UpdateBillingSettings.InvalidCollectionMethod',
        'only SEND_INVOICE is available: automatic collection needs a payment provider',
      );
    }
    this.settings = parseContract(
      zBillingSettings,
      body,
      'BillingSubscriptions updateSettings',
    );
    this.invoices.setDefaultDaysUntilDue(this.settings.defaultDaysUntilDue);
    // The terms a subscription does not name follow the organization's.
    for (const subscription of this.subscriptions) {
      if (subscription.daysUntilDueOverride === undefined) {
        subscription.daysUntilDue = this.settings.defaultDaysUntilDue;
      }
    }

    return clone(this.settings);
  }

  // --- Subscribe --------------------------------------------------------------

  private refuse(status: number, code: string, detail: string): never {
    throw new BillingProblem(status, `SubscribeInstance.${code}`, detail);
  }

  private priceOf(licenseSlug: string, id: string): Price | undefined {
    return (this.catalogue.prices[licenseSlug] ?? []).find(
      (price) => price.id === id,
    );
  }

  /**
   * `POST /instances/{instanceSlug}/billing`: starts billing an instance on a
   * FLAT_FEE price of its license version, with the checks the API makes in the
   * order it makes them. A base price that bills in advance issues the invoice
   * of the first period at once; a CANCELED subscription is subscribed again on
   * the same row.
   */
  subscribe(slug: string, body: NewSubscription): StartedSubscription {
    this.problems.consume('subscribeInstance');
    const instance = this.instance(slug);
    if (!instance) {
      throw new BillingProblem(
        404,
        'SubscribeInstance.InstanceNotFound',
        `instance "${slug}" not found`,
      );
    }
    const existing = this.subscriptionOf(slug);
    if (existing && existing.status !== 'CANCELED') {
      this.refuse(
        409,
        'AlreadySubscribed',
        'this instance already has a live subscription',
      );
    }
    if (instance.licenseState !== 'PUBLISHED') {
      this.refuse(
        422,
        'LicenseNotPublished',
        "the instance's licence version is not PUBLISHED: only a version on sale can be subscribed to",
      );
    }
    const price = this.priceOf(instance.licenseSlug, body.basePriceId);
    if (!price) {
      const elsewhere = Object.values(this.catalogue.prices)
        .flat()
        .some((candidate) => candidate.id === body.basePriceId);
      if (elsewhere) {
        this.refuse(
          422,
          'PriceNotOnInstanceLicense',
          "basePriceId is a price of another licence version than the instance's",
        );
      }
      throw new BillingProblem(
        404,
        'SubscribeInstance.PriceNotFound',
        `price ${body.basePriceId} not found`,
      );
    }
    if (price.billingModel !== 'FLAT_FEE') {
      this.refuse(
        422,
        'PriceNotFlatFee',
        'the base price of a subscription is a FLAT_FEE price',
      );
    }
    if (price.status !== 'ACTIVE') {
      this.refuse(
        422,
        'PriceDeprecated',
        'a deprecated price is no longer offered',
      );
    }
    if (
      body.daysUntilDue !== undefined &&
      (body.daysUntilDue < 0 || body.daysUntilDue > 365)
    ) {
      this.refuse(
        422,
        'InvalidDaysUntilDue',
        'daysUntilDue is between 0 and 365',
      );
    }

    const now = new Date(this.now());
    const months = PERIOD_MONTHS[price.billingPeriod ?? 'MONTHLY'];
    let anchor = now;
    if (body.startAt !== undefined) {
      anchor = new Date(body.startAt);
      if (anchor.getTime() > now.getTime()) {
        this.refuse(422, 'StartAtInFuture', 'startAt is in the future');
      }
      if (anchor.getTime() < addMonthsClamped(now, -months).getTime()) {
        this.refuse(
          422,
          'StartAtTooEarly',
          'startAt is at most one billing period ago',
        );
      }
    }
    anchor = new Date(Math.floor(anchor.getTime() / 1000) * 1000);
    const periodEnd = addMonthsClamped(anchor, months);

    if (this.invoices.hasBoundary(slug, 'ACTIVATION', anchor.toISOString())) {
      this.refuse(
        409,
        'BoundaryConflict',
        'an invoice of this subscription already bills a period starting at this instant: start at another one',
      );
    }

    const at = now.toISOString();
    const started: InstanceBilling = {
      anchorAt: anchor.toISOString(),
      basePrice: price,
      billingPeriod: price.billingPeriod ?? 'MONTHLY',
      cancelAtPeriodEnd: false,
      collectionMethod: 'SEND_INVOICE',
      createdAt: existing?.createdAt ?? at,
      currency: price.currency,
      currentPeriodEnd: periodEnd.toISOString(),
      currentPeriodStart: anchor.toISOString(),
      customerName: instance.customerName,
      customerSlug: instance.customerSlug,
      daysUntilDue: body.daysUntilDue ?? this.settings.defaultDaysUntilDue,
      daysUntilDueOverride: body.daysUntilDue,
      id: existing?.id ?? `sub-${slug}`,
      instanceName: instance.instanceName,
      instanceSlug: instance.instanceSlug,
      providerKind: 'NOOP',
      startedAt: at,
      status: 'ACTIVE',
      updatedAt: at,
    };
    const subscription = parseContract(
      zInstanceBilling,
      started,
      'BillingSubscriptions subscribe',
    );
    this.subscriptions = this.subscriptions.filter(
      (candidate) => candidate.instanceSlug !== slug,
    );
    this.subscriptions.push(subscription);
    delete this.upcoming[slug];

    const activation =
      price.billingTiming === 'ADVANCE'
        ? this.issueActivation(subscription, instance, price, periodEnd)
        : undefined;

    return {
      ...clone(subscription),
      activationInvoice: activation ? toSummary(activation) : undefined,
    };
  }

  /** The invoice of the first period: the base fee in advance, issued now and waiting for the accounting system. */
  private issueActivation(
    subscription: InstanceBilling,
    instance: SubscribableInstance,
    price: Price,
    periodEnd: Date,
  ): Invoice {
    const id = `inv-activation-${this.sequence}`;
    this.sequence += 1;
    const amount = Math.round(Number(price.unitAmountDecimal));
    const line: InvoiceLine = buildInvoiceLine({
      amount,
      description: `1 × ${price.unitAmountDecimal} per ${subscription.billingPeriod.toLowerCase()}`,
      invoiceId: id,
      label: price.displayLabel ?? 'Base fee',
      seq: 1,
      serviceFrom: subscription.currentPeriodStart,
      serviceTo: periodEnd.toISOString(),
      type: 'BASE',
      unitAmountDecimal: price.unitAmountDecimal,
    });
    const issuedAt = new Date(this.now()).toISOString();
    const free = amount === 0;

    return this.invoices.addInvoice(
      buildInvoice({
        boundaryAt: subscription.currentPeriodStart,
        createdAt: issuedAt,
        currency: price.currency,
        daysUntilDue: subscription.daysUntilDue,
        handoff: free ? undefined : { claimCount: 0, status: 'PENDING' },
        id,
        identity: {
          customerName: instance.customerName,
          customerSlug: instance.customerSlug,
          instanceName: instance.instanceName,
          instanceSlug: instance.instanceSlug,
          licenseId: instance.licenseId,
          licenseSlug: instance.licenseSlug,
        },
        issuedAt,
        kind: 'ACTIVATION',
        lines: [line],
        paidAt: free ? issuedAt : undefined,
        status: free ? 'PAID' : 'MANUAL',
      }),
    );
  }
}
