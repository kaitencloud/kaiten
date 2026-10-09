import { z } from 'zod';
import type {
  BillingSettings,
  CanceledSubscription,
  InstanceAddon,
  InstanceBilling,
  Invoice,
  InvoiceLine,
  InvoicePreview,
  NewSubscription,
  PageInvoiceSummary,
  PlanChangeTarget,
  Price,
  StartedSubscription,
  SubscriptionCancellation,
  SubscriptionTerms,
} from '@/api-client';
import type { GetInstancesBillingQuery } from '@/api-client/graphql/graphql';
import {
  zBillingSettings,
  zInstanceBilling,
  zInvoicePreview,
  zPrice,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { buildInvoice, buildInvoiceLine } from '../fixtures/build-invoice';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { AddonCatalogue } from './billing-addon-catalogue';
import { composeDiscounts } from './billing-discounts';
import {
  type BillingInvoices,
  type InvoiceListQuery,
  toSummary,
} from './billing-invoices';
import {
  INSTANCE_ADDON_OPERATIONS,
  InstanceAddons,
  type InstanceAddonOperation,
  type SerializedInstanceAddons,
} from './billing-instance-addons';
import { SubscriptionLifecycle } from './billing-lifecycle';
import { BillingProblem } from './billing-problem';
import type { ProviderRules } from './billing-providers';
import { BillingVouchers, type VoucherWorld } from './billing-vouchers';
import type { RedeemingInstance } from './billing-voucher-rules';
import { addMonthsClamped } from './license-invoice-preview';

const clone = <T>(value: T): T => structuredClone(value);

const PERIOD_MONTHS = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
} as const;

/** A subscription that bills: the states a voucher can be redeemed against. */
const isLiveSubscription = (
  subscription: InstanceBilling | undefined,
): subscription is InstanceBilling =>
  subscription !== undefined &&
  (subscription.status === 'TRIAL' ||
    subscription.status === 'ACTIVE' ||
    subscription.status === 'PAST_DUE');

const isInstanceAddonOperation = (
  operation: string,
): operation is InstanceAddonOperation =>
  (INSTANCE_ADDON_OPERATIONS as readonly string[]).includes(operation);

/** Where the API puts the default terms of an organization that never wrote any. */
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  defaultCollectionMethod: 'SEND_INVOICE',
  defaultDaysUntilDue: 30,
  handoffStripeInvoices: false,
};

/** What the mocks arm to fail with a problem document, once. */
export type SubscriptionProblemOperation =
  | 'cancelPlanChange'
  | 'cancelSubscription'
  | 'getBillingSettings'
  | 'getInstanceBilling'
  | 'getUpcomingInvoice'
  | 'listInstanceInvoices'
  | 'reactivateSubscription'
  | 'schedulePlanChange'
  | 'subscribeInstance'
  | 'updateBillingSettings'
  | 'updateInstanceBilling';

/** An instance and its subscription as the lists of instances read them over GraphQL (`Instance.billing`). */
export type InstanceBillingRow =
  GetInstancesBillingQuery['instances']['items'][number];

/** An instance as the subscription of a mock sees it: who it is for, and the version it is on. */
export type SubscribableInstance = {
  customerName: string;
  customerSlug: string;
  /** The entitlements the instance has, whatever their type: a boost of none of them has nothing to boost. Left out, every one. */
  entitlementSlugs?: string[];
  instanceName: string;
  instanceSlug: string;
  /** The family of the license: the add-ons an instance can attach are declared against it. */
  licenseFamilySlug?: string;
  licenseId: string;
  licenseSlug: string;
  /** Only a PUBLISHED version can be subscribed to. */
  licenseState: 'ARCHIVED' | 'DRAFT' | 'PUBLISHED';
  /** The trial a subscription starts with when it names none: the commercial field of the version. */
  trialPeriodDays?: number;
};

/**
 * What the billing slot knows of the rest of the organization, so that it can
 * answer a subscribe as the API does without the slots of the instances and the
 * licenses: the instances that exist and the prices of their versions. A slot
 * keeps its own copy of what it needs, as every other slot does.
 */
export type BillingCatalogue = {
  instances: SubscribableInstance[];
  /**
   * The state of the versions that are not on sale, by slug, for the ones no
   * instance runs; a version left out is published.
   */
  licenseStates?: Record<string, SubscribableInstance['licenseState']>;
  /** The prices of each license version, by the slug of the version. */
  prices: Record<string, Price[]>;
};

export type BillingSubscriptionsSeed = {
  /** The add-ons each instance holds, by instance slug. */
  addons?: Record<string, InstanceAddon[]>;
  catalogue?: BillingCatalogue;
  settings?: BillingSettings;
  subscriptions?: InstanceBilling[];
  /** The invoice each subscription's next boundary will issue; one that is not listed is composed from its base price. */
  upcoming?: Record<string, InvoicePreview>;
};

export type SerializedBillingSubscriptions = {
  armedProblems: Array<[SubscriptionProblemOperation, ArmedBillingProblem]>;
  catalogue: BillingCatalogue;
  /** The add-ons of each instance; a state stored before they existed has none. */
  instanceAddons?: SerializedInstanceAddons;
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
  /** The add-ons the instances hold, and the checks of attaching one. */
  instanceAddons: InstanceAddons;
  private catalogue: BillingCatalogue;
  private readonly lifecycle: SubscriptionLifecycle;
  /** What a move to a payment provider checks of the world; none until a model of the providers is given. */
  private providerRules: (() => ProviderRules | undefined) | undefined;
  private sequence = 1;
  private settings: BillingSettings;
  private subscriptions: InstanceBilling[];
  private upcoming: Record<string, InvoicePreview>;

  constructor(
    private readonly invoices: BillingInvoices,
    seed: BillingSubscriptionsSeed = {},
    private readonly now: () => number = () => Date.now(),
    private readonly addonCatalogue: AddonCatalogue = new AddonCatalogue(),
    private readonly vouchers: BillingVouchers = new BillingVouchers(),
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
    this.instanceAddons = new InstanceAddons(
      this.instanceAddonsDeps(),
      seed.addons,
    );
    this.addonCatalogue.setHolders(this.instanceAddons);
    this.vouchers.setWorld(this.voucherWorld());
    this.invoices.setDefaultDaysUntilDue(this.settings.defaultDaysUntilDue);
    this.lifecycle = new SubscriptionLifecycle({
      catalogue: () => this.catalogue,
      defaultCollectionMethod: () => this.settings.defaultCollectionMethod,
      defaultDaysUntilDue: () => this.settings.defaultDaysUntilDue,
      invoices: this.invoices,
      nextSequence: () => this.sequence++,
      now: this.now,
      providers: () => this.providerRules?.(),
      subscriptionOf: (slug) => this.subscriptionOf(slug),
      upcomingOf: (slug) => this.upcoming[slug],
      write: (subscription) => this.write(subscription),
    });
  }

  static fromSerialized(
    invoices: BillingInvoices,
    state: SerializedBillingSubscriptions,
    now?: () => number,
    addonCatalogue?: AddonCatalogue,
    vouchers?: BillingVouchers,
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
      addonCatalogue,
      vouchers,
    );
    model.sequence = state.sequence;
    if (state.instanceAddons) {
      model.instanceAddons = InstanceAddons.fromSerialized(
        model.instanceAddonsDeps(),
        state.instanceAddons,
      );
      model.addonCatalogue.setHolders(model.instanceAddons);
    }
    model.vouchers.setWorld(model.voucherWorld());
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingSubscriptions {
    return {
      armedProblems: this.problems.serialize(),
      catalogue: clone(this.catalogue),
      instanceAddons: this.instanceAddons.serialize(),
      sequence: this.sequence,
      settings: clone(this.settings),
      subscriptions: clone(this.subscriptions),
      upcoming: clone(this.upcoming),
    };
  }

  /**
   * Arm the next call of an operation to fail with a problem document. One-shot. The
   * operations on the add-ons of an instance are the add-ons' own and are armed
   * there; they are accepted here too, since they are the instance's.
   */
  armProblem(
    operation: InstanceAddonOperation | SubscriptionProblemOperation,
    problem: ArmedBillingProblem,
  ) {
    if (isInstanceAddonOperation(operation)) {
      this.instanceAddons.armProblem(operation, problem);

      return;
    }
    this.problems.arm(operation, problem);
  }

  /** What the attachments need of the instances and their subscriptions. */
  private instanceAddonsDeps() {
    return {
      catalogue: this.addonCatalogue,
      isKnown: (slug: string) => this.isKnown(slug),
      licenseFamilyOf: (slug: string) => this.instance(slug)?.licenseFamilySlug,
      now: () => this.now(),
      subscriptionOf: (slug: string) => this.subscriptionOf(slug),
    };
  }

  /** What the vouchers need of the organization: the instances, the catalogue they name and the clock. */
  private voucherWorld(): VoucherWorld {
    const knowsPrice = (id: string) =>
      Object.values(this.catalogue.prices).some((prices) =>
        prices.some((price) => price.id === id),
      );

    return {
      entitlementType: (slug) => this.addonCatalogue.entitlementTypeOf(slug),
      hasAddon: (id) => this.addonCatalogue.hasVersionId(id),
      hasAddonPrice: (id) => this.addonCatalogue.hasPriceId(id),
      hasCustomer: (slug) =>
        this.catalogue.instances.some(
          (instance) => instance.customerSlug === slug,
        ),
      hasLicense: (id) =>
        this.catalogue.instances.some((instance) => instance.licenseId === id),
      hasLicensePrice: knowsPrice,
      instance: (slug) => this.redeemingInstance(slug),
      now: () => this.now(),
    };
  }

  /** The instance as the redemption rules read it. */
  private redeemingInstance(slug: string): RedeemingInstance | undefined {
    const instance = this.instance(slug);
    if (!instance) {
      return undefined;
    }
    const subscription = this.subscriptionOf(slug);

    return {
      addonIds: this.instanceAddons
        .activeOf(slug)
        .map((attached) => attached.addonId),
      customerHasPaid: this.invoices
        .snapshot()
        .some(
          (invoice) =>
            invoice.customerSlug === instance.customerSlug &&
            invoice.status === 'PAID' &&
            invoice.total > 0,
        ),
      customerSlug: instance.customerSlug,
      entitlementSlugs: instance.entitlementSlugs,
      licenseId: instance.licenseId,
      subscription: isLiveSubscription(subscription)
        ? clone(subscription)
        : undefined,
    };
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

  /** Replaces a subscription by its new state, checked against the contract. */
  private write(subscription: InstanceBilling): InstanceBilling {
    const next = parseContract(
      zInstanceBilling,
      subscription,
      'BillingSubscriptions write',
    );
    this.subscriptions = this.subscriptions.map((candidate) =>
      candidate.instanceSlug === next.instanceSlug ? next : candidate,
    );

    return clone(next);
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

  /**
   * `Instance.billing` for every instance the model knows, as the GraphQL API
   * answers it: the summary of the subscription, live or CANCELED, and `null` for
   * an instance nobody ever subscribed. The order is the order the instances come
   * in; a subscription whose instance the catalogue does not list comes last.
   */
  listInstanceBillingSummaries(): InstanceBillingRow[] {
    const slugs = [
      ...new Set([
        ...this.catalogue.instances.map((instance) => instance.instanceSlug),
        ...this.subscriptions.map((subscription) => subscription.instanceSlug),
      ]),
    ];

    return slugs.map((slug) => {
      const subscription = this.subscriptionOf(slug);

      return {
        billing: subscription
          ? {
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              currentPeriodEnd: subscription.currentPeriodEnd,
              pastDueSince: subscription.pastDueSince ?? null,
              providerKind: subscription.providerKind,
              status: subscription.status,
              trialEndsAt: subscription.trialEndsAt ?? null,
            }
          : null,
        slug,
      };
    });
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

    return this.withDiscounts(
      this.upcoming[slug] ?? this.composeUpcoming(subscription),
      subscription,
    );
  }

  /**
   * The vouchers the instance redeemed discount the invoice its boundary issues, whether
   * the preview was seeded or composed: a DISCOUNT line for each, and the totals that
   * follow. A preview nothing discounts is left as it is.
   */
  private withDiscounts(
    preview: InvoicePreview,
    subscription: InstanceBilling,
  ): InvoicePreview {
    const lines = preview.lines.filter((line) => line.type !== 'DISCOUNT');
    const discounts = composeDiscounts({
      at: Date.parse(preview.boundaryAt),
      currency: subscription.currency,
      invoiceId: 'upcoming',
      lines,
      sources: this.vouchers.discountSourcesOf(subscription.instanceSlug),
    }).map(({ line }) => line);
    if (discounts.length === 0) {
      return clone(preview);
    }
    let subtotal = 0;
    for (const line of lines) {
      subtotal += line.amount;
    }
    let discountTotal = 0;
    for (const line of discounts) {
      discountTotal -= line.amount;
    }

    return parseContract(
      zInvoicePreview,
      {
        ...preview,
        discountTotal,
        lines: [...lines, ...discounts],
        subtotal,
        total: subtotal - discountTotal,
      },
      'BillingSubscriptions upcoming invoice with discounts',
    );
  }

  /**
   * What the next boundary issues when nothing says otherwise: the arrears of
   * the period that ends when the base bills in arrears, and the base of the
   * period that starts when the plan bills in advance, which is the plan a
   * scheduled change moves to. A trial has no period to bill: what its end
   * issues is the activation, with the first period in advance.
   */
  private composeUpcoming(subscription: InstanceBilling): InvoicePreview {
    const trial = subscription.status === 'TRIAL';
    const { basePrice } = subscription;
    const plan = subscription.scheduledChange?.price ?? basePrice;
    const boundary = subscription.currentPeriodEnd;
    const lines: InvoiceLine[] = [];
    const addBase = (price: Price, from: string, to: string) => {
      lines.push(
        buildInvoiceLine({
          amount: Math.round(Number(price.unitAmountDecimal)),
          description: `1 × ${price.unitAmountDecimal} per ${(price.billingPeriod ?? subscription.billingPeriod).toLowerCase()}`,
          invoiceId: 'upcoming',
          label: price.displayLabel ?? 'Base fee',
          licensePriceId: price.id,
          seq: lines.length + 1,
          serviceFrom: from,
          serviceTo: to,
          type: 'BASE',
          unitAmountDecimal: price.unitAmountDecimal,
        }),
      );
    };
    if (!trial && basePrice.billingTiming === 'ARREARS') {
      addBase(basePrice, subscription.currentPeriodStart, boundary);
    }
    if (plan.billingTiming === 'ADVANCE') {
      addBase(
        plan,
        boundary,
        addMonthsClamped(
          new Date(boundary),
          PERIOD_MONTHS[plan.billingPeriod ?? subscription.billingPeriod],
        ).toISOString(),
      );
    }
    let total = 0;
    for (const line of lines) {
      total += line.amount;
    }
    const instance = this.instance(subscription.instanceSlug);

    return parseContract(
      zInvoicePreview,
      {
        asOf: new Date(this.now()).toISOString(),
        boundaryAt: boundary,
        currency: subscription.currency,
        discountTotal: 0,
        kind: trial ? 'ACTIVATION' : 'RENEWAL',
        licenseSlug: instance?.licenseSlug ?? '',
        lines,
        serviceFrom: lines[0]?.serviceFrom,
        serviceTo: lines.at(-1)?.serviceTo,
        status: 'PREVIEW',
        subtotal: total,
        total,
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

  // --- Lifecycle ----------------------------------------------------------------

  /** `POST /instances/{instanceSlug}/billing/cancel`. */
  cancelSubscription(
    slug: string,
    body: SubscriptionCancellation,
  ): CanceledSubscription {
    this.problems.consume('cancelSubscription');

    return this.lifecycle.cancel(slug, body);
  }

  /** `POST /instances/{instanceSlug}/billing/reactivate`. */
  reactivateSubscription(slug: string): InstanceBilling {
    this.problems.consume('reactivateSubscription');

    return this.lifecycle.reactivate(slug);
  }

  /** `PUT /instances/{instanceSlug}/billing/scheduled-change`. */
  schedulePlanChange(slug: string, body: PlanChangeTarget): InstanceBilling {
    this.problems.consume('schedulePlanChange');

    return this.lifecycle.schedulePlanChange(slug, body);
  }

  /** `DELETE /instances/{instanceSlug}/billing/scheduled-change`. */
  cancelPlanChange(slug: string): InstanceBilling {
    this.problems.consume('cancelPlanChange');

    return this.lifecycle.cancelPlanChange(slug);
  }

  /** `PATCH /instances/{instanceSlug}/billing`. */
  updateTerms(slug: string, body: SubscriptionTerms): InstanceBilling {
    this.problems.consume('updateInstanceBilling');

    return this.lifecycle.updateTerms(slug, body);
  }

  // --- Settings ---------------------------------------------------------------

  /** Gives the model the world a move to a payment provider is checked against. */
  setProviderRules(rules: () => ProviderRules | undefined) {
    this.providerRules = rules;
  }

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
    // Automatic collection needs a connected provider that charges by itself.
    const charges = ['STRIPE', 'NOOP'].some(
      (kind) =>
        this.providerRules?.()?.connection(kind as 'NOOP' | 'STRIPE')
          ?.automaticCollection,
    );
    if (body.defaultCollectionMethod !== 'SEND_INVOICE' && !charges) {
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
    // A trial named by the request, else the one the version carries, else none.
    const trialDays = body.trialDays ?? instance.trialPeriodDays ?? 0;
    if (trialDays < 0) {
      this.refuse(422, 'InvalidTrialDays', 'trialDays is 0 (no trial) or more');
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
    // During a trial the period is the trial: nothing is billed until it ends.
    const periodEnd =
      trialDays > 0
        ? new Date(anchor.getTime() + trialDays * 24 * 60 * 60 * 1000)
        : addMonthsClamped(anchor, months);

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
      status: trialDays > 0 ? 'TRIAL' : 'ACTIVE',
      trialEndsAt: trialDays > 0 ? periodEnd.toISOString() : undefined,
      updatedAt: at,
    };
    const subscription = parseContract(
      zInstanceBilling,
      started,
      'BillingSubscriptions subscribe',
    );
    // The add-ons it starts with are checked against the subscription about to be
    // written, before anything is: one refused refuses the whole subscribe.
    const checked = body.addOns?.length
      ? this.instanceAddons.checkForSubscription(
          slug,
          body.addOns,
          subscription,
        )
      : [];
    // Then the voucher, after the add-ons as the API does: a code it refuses refuses
    // the whole subscribe, and the rules that read the subscription see this one.
    const redeem = body.voucherCode
      ? this.checkVoucherForSubscription(slug, body.voucherCode, subscription)
      : undefined;
    this.subscriptions = this.subscriptions.filter(
      (candidate) => candidate.instanceSlug !== slug,
    );
    this.subscriptions.push(subscription);
    delete this.upcoming[slug];
    this.instanceAddons.commit(slug, checked, subscription);
    redeem?.();

    // An invoice is due now when something is billed in advance, and no trial holds it back.
    const activation =
      trialDays === 0
        ? this.issueActivation(subscription, instance, price, periodEnd)
        : undefined;

    return {
      ...clone(subscription),
      activationInvoice: activation ? toSummary(activation) : undefined,
    };
  }

  /**
   * A code given to a subscribe: refused as the API refuses it, 422 `VoucherInvalid`,
   * with the redemption's own refusal in the error that locates the member.
   */
  private checkVoucherForSubscription(
    slug: string,
    code: string,
    subscription: InstanceBilling,
  ): () => unknown {
    try {
      return this.vouchers.checkForSubscription(slug, code, subscription);
    } catch (error) {
      if (!(error instanceof BillingProblem)) {
        throw error;
      }
      throw new BillingProblem(
        422,
        'SubscribeInstance.VoucherInvalid',
        'the voucher cannot be redeemed',
        {
          errors: [
            {
              location: 'body.voucherCode',
              message: error.message,
              value: { code: error.code },
            },
          ],
        },
      );
    }
  }

  /**
   * The lines billed in advance for a period starting at `from`: the base fee, when it
   * bills in advance, and the default fee of the period of each add-on the instance
   * holds, quantity held times the price.
   */
  private advanceLines(
    invoiceId: string,
    subscription: InstanceBilling,
    price: Price,
    from: string,
    to: string,
  ): InvoiceLine[] {
    const lines: InvoiceLine[] = [];
    if (price.billingTiming === 'ADVANCE') {
      lines.push(
        buildInvoiceLine({
          amount: Math.round(Number(price.unitAmountDecimal)),
          description: `1 × ${price.unitAmountDecimal} per ${subscription.billingPeriod.toLowerCase()}`,
          invoiceId,
          label: price.displayLabel ?? 'Base fee',
          licensePriceId: price.id,
          seq: 1,
          serviceFrom: from,
          serviceTo: to,
          type: 'BASE',
          unitAmountDecimal: price.unitAmountDecimal,
        }),
      );
    }
    for (const attached of this.instanceAddons.activeOf(
      subscription.instanceSlug,
    )) {
      const fee = attached.prices.find(
        (candidate) =>
          candidate.billingModel === 'FLAT_FEE' &&
          candidate.billingTiming === 'ADVANCE',
      );
      if (!fee) {
        continue;
      }
      lines.push(
        buildInvoiceLine({
          addonPriceId: fee.id,
          amount: Math.round(Number(fee.unitAmountDecimal)) * attached.quantity,
          description: `${attached.quantity} × ${fee.unitAmountDecimal} per ${subscription.billingPeriod.toLowerCase()}`,
          invoiceId,
          label: fee.displayLabel ?? attached.addonSlug,
          seq: lines.length + 1,
          serviceFrom: from,
          serviceTo: to,
          type: 'ADDON',
          unitAmountDecimal: fee.unitAmountDecimal,
        }),
      );
    }

    return lines;
  }

  /**
   * The invoice of the first period: what bills in advance, issued now and waiting for
   * the accounting system. Nothing billed in advance, nothing to issue.
   */
  private issueActivation(
    subscription: InstanceBilling,
    instance: SubscribableInstance,
    price: Price,
    periodEnd: Date,
  ): Invoice | undefined {
    const id = `inv-activation-${this.sequence}`;
    const lines = this.advanceLines(
      id,
      subscription,
      price,
      subscription.currentPeriodStart,
      periodEnd.toISOString(),
    );
    if (lines.length === 0) {
      return undefined;
    }
    this.sequence += 1;
    // The vouchers the instance redeemed, a code given to the subscribe included,
    // discount the invoice at the instant it is composed; each line uses one invoice
    // of its redemption.
    const discounts = composeDiscounts({
      at: this.now(),
      currency: price.currency,
      invoiceId: id,
      lines,
      sources: this.vouchers.discountSourcesOf(subscription.instanceSlug),
    });
    lines.push(...discounts.map(({ line }) => line));
    this.vouchers.consume(discounts.map(({ redemptionId }) => redemptionId));
    let amount = 0;
    for (const line of lines) {
      amount += line.amount;
    }
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
        lines,
        paidAt: free ? issuedAt : undefined,
        status: free ? 'PAID' : 'MANUAL',
      }),
    );
  }
}
