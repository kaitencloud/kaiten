import type {
  CanceledSubscription,
  InstanceBilling,
  InvoiceLine,
  InvoicePreview,
  PlanChangeTarget,
  Price,
  SubscriptionCancellation,
  SubscriptionTerms,
} from '@/api-client';
import { zInstanceBilling } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { buildInvoice, buildInvoiceLine } from '../fixtures/build-invoice';
import { NULL_OBJECT } from '../fixtures/null-object';
import { type BillingInvoices, toSummary } from './billing-invoices';
import { BillingProblem } from './billing-problem';
import type { ProviderRules } from './billing-providers';
import type {
  BillingCatalogue,
  SubscribableInstance,
} from './billing-subscriptions';

const clone = <T>(value: T): T => structuredClone(value);

const MAX_REASON_LENGTH = 500;

/** What the lifecycle of a subscription needs of the model that holds the subscriptions. */
export type LifecycleHost = {
  catalogue: () => BillingCatalogue;
  /** The collection method of a subscription that names none: the organization's. */
  defaultCollectionMethod: () => InstanceBilling['collectionMethod'];
  defaultDaysUntilDue: () => number;
  invoices: BillingInvoices;
  /** The id suffix of the next invoice the lifecycle issues. */
  nextSequence: () => number;
  now: () => number;
  /** What a move to a provider checks of the world; none when no provider is modeled. */
  providers: () => ProviderRules | undefined;
  subscriptionOf: (slug: string) => InstanceBilling | undefined;
  /** The invoice the next boundary would issue, when the model has been told one. */
  upcomingOf: (slug: string) => InvoicePreview | undefined;
  /** Replaces a subscription by its new state, checked against the contract. */
  write: (subscription: InstanceBilling) => InstanceBilling;
};

const isLive = (subscription: InstanceBilling) =>
  subscription.status !== 'CANCELED';

/** The world of a deployment with no payment provider: NoOp is the only one connected. */
const ONLY_NOOP: ProviderRules = {
  acceptsCurrency: () => true,
  connection: (kind) =>
    kind === 'NOOP' ? { automaticCollection: false } : undefined,
  customer: () => ({ hasUsablePaymentMethod: false }),
  ensureCustomer: () => undefined,
};

function refuse(
  operation: string,
  status: number,
  code: string,
  detail: string,
): never {
  throw new BillingProblem(status, `${operation}.${code}`, detail);
}

/**
 * The transitions of a subscription the lifecycle makes: cancelling it, taking
 * the cancellation back, scheduling and dropping a plan change, and changing
 * its terms. Each refuses as the Core API does, in the order it checks and with
 * its codes (api/internal/modules/billing/cancelsubscription, reactivatesubscription,
 * scheduleplanchange, cancelplanchange, updateinstancebilling), so that the
 * console is exercised against the reasons it will really be given.
 */
export class SubscriptionLifecycle {
  constructor(private readonly host: LifecycleHost) {}

  private find(operation: string, slug: string): InstanceBilling {
    const subscription = this.host.subscriptionOf(slug);
    if (!subscription) {
      throw new BillingProblem(
        404,
        `${operation}.NotFound`,
        `instance "${slug}" has no subscription`,
      );
    }

    return subscription;
  }

  /**
   * While a period has ended and its close has not run, a change would land
   * before or after the boundary: the API answers 409 and the close settles it.
   */
  private checkBoundary(operation: string, subscription: InstanceBilling) {
    if (
      isLive(subscription) &&
      Date.parse(subscription.currentPeriodEnd) <= this.host.now()
    ) {
      throw new BillingProblem(
        409,
        `${operation}.BoundaryPending`,
        "the subscription's period has ended and is being closed; retry in a minute",
      );
    }
  }

  private instanceOf(slug: string): SubscribableInstance | undefined {
    return this.host
      .catalogue()
      .instances.find((candidate) => candidate.instanceSlug === slug);
  }

  // --- Cancel ---------------------------------------------------------------

  /**
   * `POST /instances/{instanceSlug}/billing/cancel`. A trial ends at once with no
   * invoice, whatever the mode. At the period's end, the period paid for runs out
   * and a repeat changes nothing. Immediately, the FINAL invoice is issued now:
   * what bills in arrears, flat fees in full, and nothing refunded.
   */
  cancel(slug: string, body: SubscriptionCancellation): CanceledSubscription {
    const operation = 'CancelSubscription';
    const reason = body.reason;
    if (reason !== undefined && Array.from(reason).length > MAX_REASON_LENGTH) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidReason`,
        'reason is at most 500 characters',
      );
    }
    const subscription = this.find(operation, slug);
    if (!isLive(subscription)) {
      throw new BillingProblem(
        409,
        `${operation}.NotActive`,
        'the subscription is already canceled',
      );
    }
    this.checkBoundary(operation, subscription);

    const at = new Date(this.host.now()).toISOString();
    const mode = body.mode ?? 'AT_PERIOD_END';
    const next = clone(subscription);
    let finalInvoice: CanceledSubscription['finalInvoice'];

    if (subscription.status === 'TRIAL') {
      this.end(next, at, reason);
    } else if (mode === 'IMMEDIATE') {
      finalInvoice = toSummary(this.issueFinal(subscription, at));
      this.end(next, at, reason);
    } else if (!subscription.cancelAtPeriodEnd) {
      next.cancelAtPeriodEnd = true;
      next.cancelRequestedAt = at;
      next.cancellationReason = reason ?? null;
      // A plan change is dropped by a cancellation.
      next.scheduledChange = NULL_OBJECT;
    }
    next.updatedAt = at;

    return { ...this.host.write(next), finalInvoice };
  }

  /** Every column a transition to CANCELED writes at once. */
  private end(
    subscription: InstanceBilling,
    at: string,
    reason: string | undefined,
  ) {
    subscription.status = 'CANCELED';
    subscription.canceledAt = at;
    subscription.cancellationReason = reason ?? null;
    subscription.cancelAtPeriodEnd = false;
    subscription.cancelRequestedAt = null;
    subscription.pastDueSince = null;
    subscription.scheduledChange = NULL_OBJECT;
  }

  /**
   * The FINAL invoice of an immediate cancellation: the lines that bill in
   * arrears for the period that ends now. A base billed in advance was paid
   * for when the period began and is not refunded; one billed in arrears is
   * billed in full, with no proration. Usage so far is billed as the preview of
   * the next boundary had it. With nothing to bill the total is 0 and the
   * invoice is paid at once, never handed off.
   */
  private issueFinal(subscription: InstanceBilling, at: string) {
    const id = `inv-final-${this.host.nextSequence()}`;
    const price = subscription.basePrice;
    const lines: InvoiceLine[] = [];
    if (price.billingTiming === 'ARREARS') {
      lines.push(
        buildInvoiceLine({
          amount: Math.round(Number(price.unitAmountDecimal)),
          description: `1 × ${price.unitAmountDecimal} per ${subscription.billingPeriod.toLowerCase()}`,
          invoiceId: id,
          label: price.displayLabel ?? 'Base fee',
          seq: lines.length + 1,
          serviceFrom: subscription.currentPeriodStart,
          serviceTo: at,
          type: 'BASE',
          unitAmountDecimal: price.unitAmountDecimal,
        }),
      );
    }
    for (const line of this.host.upcomingOf(subscription.instanceSlug)?.lines ??
      []) {
      if (line.type === 'USAGE' || line.type === 'OVERAGE') {
        lines.push({
          ...clone(line),
          id: `${id}-line-${lines.length + 1}`,
          seq: lines.length + 1,
          serviceTo: at,
        });
      }
    }
    const instance = this.instanceOf(subscription.instanceSlug);
    const free = lines.every((line) => line.amount === 0);

    return this.host.invoices.addInvoice(
      buildInvoice({
        boundaryAt: at,
        createdAt: at,
        currency: subscription.currency,
        daysUntilDue: subscription.daysUntilDue,
        handoff: free ? undefined : { claimCount: 0, status: 'PENDING' },
        id,
        identity: {
          customerName: instance?.customerName ?? subscription.customerName,
          customerSlug: instance?.customerSlug ?? subscription.customerSlug,
          instanceName: instance?.instanceName ?? subscription.instanceName,
          instanceSlug: subscription.instanceSlug,
          licenseId: instance?.licenseId ?? 'license-unknown',
          licenseSlug: instance?.licenseSlug ?? 'unknown',
        },
        issuedAt: at,
        kind: 'FINAL',
        lines,
        paidAt: free ? at : undefined,
        status: free ? 'PAID' : 'MANUAL',
      }),
    );
  }

  // --- Reactivate -----------------------------------------------------------

  /** `POST /instances/{instanceSlug}/billing/reactivate`: takes a scheduled cancellation back. */
  reactivate(slug: string): InstanceBilling {
    const operation = 'ReactivateSubscription';
    const subscription = this.find(operation, slug);
    if (!isLive(subscription)) {
      throw new BillingProblem(
        409,
        `${operation}.Canceled`,
        'the subscription is canceled: subscribe it again',
      );
    }
    if (!subscription.cancelAtPeriodEnd) {
      throw new BillingProblem(
        409,
        `${operation}.NotScheduledForCancellation`,
        'no cancellation is scheduled',
      );
    }
    this.checkBoundary(operation, subscription);

    const next = clone(subscription);
    next.cancelAtPeriodEnd = false;
    next.cancelRequestedAt = null;
    next.cancellationReason = null;
    next.updatedAt = new Date(this.host.now()).toISOString();

    return this.host.write(next);
  }

  // --- Plan change ----------------------------------------------------------

  private priceOf(
    id: string,
  ): { license: string | undefined; price: Price } | undefined {
    const { prices } = this.host.catalogue();
    for (const [license, versionPrices] of Object.entries(prices)) {
      const price = versionPrices.find((candidate) => candidate.id === id);
      if (price) {
        return { license, price };
      }
    }

    return undefined;
  }

  /** The state of a license version: on sale unless the catalogue says it is not. */
  private licenseState(license: string | undefined) {
    const { instances, licenseStates } = this.host.catalogue();

    return (
      (license ? licenseStates?.[license] : undefined) ??
      instances.find((instance) => instance.licenseSlug === license)
        ?.licenseState ??
      'PUBLISHED'
    );
  }

  /**
   * `PUT /instances/{instanceSlug}/billing/scheduled-change`: the move to another
   * FLAT_FEE price of any published version, in the currency of the subscription,
   * at the next boundary. Scheduling the target already scheduled changes
   * nothing; another one replaces it.
   */
  schedulePlanChange(slug: string, body: PlanChangeTarget): InstanceBilling {
    const operation = 'SchedulePlanChange';
    const subscription = this.find(operation, slug);
    if (subscription.status === 'TRIAL') {
      refuse(
        operation,
        409,
        'TrialInProgress',
        'a trial cannot change plan: cancel it and subscribe with the new price',
      );
    }
    if (!isLive(subscription)) {
      refuse(operation, 409, 'NotActive', 'the subscription is canceled');
    }
    if (subscription.cancelAtPeriodEnd) {
      refuse(
        operation,
        409,
        'CancellationScheduled',
        "the subscription is set to cancel at the period's end",
      );
    }
    this.checkBoundary(operation, subscription);

    const target = this.priceOf(body.licensePriceId);
    if (!target) {
      refuse(
        operation,
        404,
        'PriceNotFound',
        `price ${body.licensePriceId} not found`,
      );
    }
    const { license, price } = target;
    if (price.billingModel !== 'FLAT_FEE') {
      refuse(
        operation,
        422,
        'PriceNotFlatFee',
        "a subscription's base is a FLAT_FEE price",
      );
    }
    if (price.status !== 'ACTIVE') {
      refuse(
        operation,
        422,
        'PriceDeprecated',
        'a deprecated price is no longer offered',
      );
    }
    if (this.licenseState(license) !== 'PUBLISHED') {
      refuse(
        operation,
        422,
        'LicenseNotPublished',
        "the price's licence version is not PUBLISHED",
      );
    }
    if (price.id === subscription.basePrice.id) {
      refuse(
        operation,
        422,
        'SamePrice',
        'the subscription is already on this price',
      );
    }
    if (price.currency !== subscription.currency) {
      refuse(
        operation,
        422,
        'CurrencyMismatch',
        `the boundary's invoice bills the old plan and the new one in one currency: ${subscription.currency}`,
      );
    }
    if (subscription.scheduledChange?.price.id === price.id) {
      return clone(subscription);
    }

    const at = new Date(this.host.now()).toISOString();
    const next = clone(subscription);
    next.scheduledChange = {
      effectiveAt: subscription.currentPeriodEnd,
      price: clone(price),
      scheduledAt: at,
    };
    next.updatedAt = at;

    return this.host.write(next);
  }

  /** `DELETE /instances/{instanceSlug}/billing/scheduled-change`. */
  cancelPlanChange(slug: string): InstanceBilling {
    const operation = 'CancelPlanChange';
    const subscription = this.find(operation, slug);
    if (!subscription.scheduledChange) {
      throw new BillingProblem(
        409,
        `${operation}.NoPlanChangeScheduled`,
        'no plan change is scheduled',
      );
    }
    this.checkBoundary(operation, subscription);

    const next = clone(subscription);
    next.scheduledChange = NULL_OBJECT;
    next.updatedAt = new Date(this.host.now()).toISOString();

    return this.host.write(next);
  }

  // --- Terms ----------------------------------------------------------------

  /**
   * What moving a subscription to a provider, or to another way of collecting,
   * checks of the world before anything is written, in the order the API checks it
   * (updateinstancebilling.checkProvider): the provider is connected, it can
   * collect the way asked, the customer has a payment method to charge, then the
   * currency, the billing e-mail and the registration of the customer.
   */
  private checkProvider(
    operation: string,
    subscription: InstanceBilling,
    body: SubscriptionTerms,
  ) {
    const rules = this.host.providers() ?? ONLY_NOOP;
    const target =
      body.providerKind && body.providerKind !== subscription.providerKind
        ? body.providerKind
        : undefined;
    const kind = target ?? subscription.providerKind;
    let method = subscription.collectionMethod;
    if (body.collectionMethod !== undefined) {
      method = body.collectionMethod ?? this.host.defaultCollectionMethod();
    }
    if (method === 'SEND_INVOICE' && !target) {
      return;
    }
    const connection = rules.connection(kind);
    if (!connection) {
      throw new BillingProblem(
        422,
        `${operation}.ProviderNotConnected`,
        'the payment provider is not connected for this organization',
      );
    }
    if (method !== 'SEND_INVOICE' && !connection.automaticCollection) {
      throw new BillingProblem(
        422,
        `${operation}.CollectionMethodUnsupported`,
        'only SEND_INVOICE is available: the payment provider cannot charge automatically',
      );
    }
    const customer = rules.customer(subscription.customerSlug);
    if (method === 'CHARGE_AUTOMATICALLY' && kind === 'STRIPE') {
      if (!customer.hasUsablePaymentMethod) {
        throw new BillingProblem(
          422,
          `${operation}.PaymentMethodRequired`,
          'the customer has no usable payment method to charge: save one through a payment-method session first',
        );
      }
    }
    if (!target || kind !== 'STRIPE') {
      return;
    }
    if (!rules.acceptsCurrency(subscription.currency)) {
      throw new BillingProblem(
        422,
        `${operation}.UnsupportedCurrency`,
        `the payment provider does not accept ${subscription.currency}`,
      );
    }
    if (method === 'SEND_INVOICE' && !customer.billingEmail) {
      throw new BillingProblem(
        422,
        `${operation}.BillingEmailMissing`,
        'the customer has no billing e-mail: the payment provider sends the invoices there',
      );
    }
    rules.ensureCustomer(subscription.customerSlug);
  }

  /**
   * `PATCH /instances/{instanceSlug}/billing`: the payment provider, the collection
   * method and the payment terms, from the next invoice on. A member left out is
   * left alone and `null` goes back to the organization's default, as the API reads
   * a PATCH. Invoices already composed keep their own provider and terms.
   */
  updateTerms(slug: string, body: SubscriptionTerms): InstanceBilling {
    const operation = 'UpdateInstanceBilling';
    const subscription = this.find(operation, slug);
    if (
      typeof body.daysUntilDue === 'number' &&
      (body.daysUntilDue < 0 || body.daysUntilDue > 365)
    ) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidDaysUntilDue`,
        'daysUntilDue is between 0 and 365',
      );
    }
    this.checkProvider(operation, subscription, body);
    if (!isLive(subscription)) {
      throw new BillingProblem(
        409,
        `${operation}.NotActive`,
        'the subscription is canceled',
      );
    }
    this.checkBoundary(operation, subscription);

    const next = clone(subscription);
    if (body.daysUntilDue === null) {
      next.daysUntilDueOverride = null;
      next.daysUntilDue = this.host.defaultDaysUntilDue();
    } else if (body.daysUntilDue !== undefined) {
      next.daysUntilDueOverride = body.daysUntilDue;
      next.daysUntilDue = body.daysUntilDue;
    }
    if (body.collectionMethod === null) {
      next.collectionMethodOverride = null;
      next.collectionMethod = this.host.defaultCollectionMethod();
    } else if (body.collectionMethod !== undefined) {
      next.collectionMethodOverride = body.collectionMethod;
      next.collectionMethod = body.collectionMethod;
    }
    if (body.providerKind !== undefined) {
      next.providerKind = body.providerKind;
    }
    next.updatedAt = new Date(this.host.now()).toISOString();

    return this.host.write(next);
  }
}

/** Checks a subscription against the contract, as every state of the model is. */
export function parseSubscription(subscription: InstanceBilling) {
  return parseContract(
    zInstanceBilling,
    subscription,
    'BillingSubscriptions lifecycle',
  );
}
