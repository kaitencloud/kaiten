import type {
  PublicCatalog,
  PublicPlan,
  PublicPrice,
  SessionCheckout,
  SessionCheckoutOrder,
  SessionInvoice,
  SessionPortal,
} from '@/api-client';
import {
  zPublicCatalog,
  zSessionInvoice,
  zSessionPortal,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import {
  buildKaitenCloudCatalog,
  buildKaitenCloudEntitlements,
  buildKaitenCloudInvoice,
  buildKaitenCloudInvoices,
  buildKaitenCloudPortal,
  buildKaitenCloudSubscription,
  KAITEN_CLOUD_PLANS,
  kaitenCloudId,
} from '../fixtures/build-kaiten-cloud-plan';
import { type ArmedBillingProblem, ArmedProblems } from './armed-problems';
import { type PageRequest, pageOfRows } from './billing-pages';
import { BillingProblem } from './billing-problem';

/** The calls of the Plan & usage page a spec can make the mocks refuse. */
export type PlanOperation =
  | 'createPlanSession'
  | 'createSessionCheckout'
  | 'getPublicCatalog'
  | 'getSessionPortal'
  | 'listSessionInvoices';

/** Why saas-api mints no session for the page, by the state the page draws. */
export type PlanSessionRefusal =
  | 'forbidden'
  | 'notEnabled'
  | 'notProvisioned'
  | 'unavailable';

/**
 * saas-api's refusals of `POST /plan/session`, with the codes the page reads
 * (`planSessionProblem`): the flag off for the organization, no Kaiten Cloud
 * instance for it yet, a caller who is not an administrator, Kaiten Cloud out of reach.
 */
export const PLAN_SESSION_REFUSALS: Record<
  PlanSessionRefusal,
  ArmedBillingProblem
> = {
  forbidden: {
    code: 'Auth.InsufficientScope',
    detail: 'only an administrator of the organization may read its plan',
    status: 403,
  },
  notEnabled: {
    code: 'CreatePlanSession.NotEnabled',
    detail: 'plan billing is not enabled for this organization',
    status: 403,
  },
  notProvisioned: {
    code: 'CreatePlanSession.NotProvisioned',
    detail: 'Kaiten Cloud has no instance for this organization yet',
    status: 404,
  },
  unavailable: {
    code: 'CreatePlanSession.Unavailable',
    detail: 'Kaiten Cloud could not be reached',
    status: 503,
  },
};

/** A customer session (`kst_`) the mocks minted, and when it stops being accepted. */
export type PlanSession = { expiresAt: string; token: string };

/** How long a session saas-api mints lasts. */
const SESSION_TTL_MS = 30 * 60_000;
/** How long the payment provider's page that saves a card stays open. */
const SETUP_TTL_MS = 24 * 3_600_000;

const MONTHS: Record<NonNullable<PublicPrice['billingPeriod']>, number> = {
  ANNUAL: 12,
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
};

const periodEnd = (start: Date, period: PublicPrice['billingPeriod']) => {
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + MONTHS[period ?? 'MONTHLY']);
  return end.toISOString();
};

const refusal = (status: number, code: string, detail: string) =>
  new BillingProblem(status, code, detail);
const invalidCredential = () =>
  refusal(401, 'PublicAuth.InvalidCredential', 'invalid credential');
const wrongCredentialKind = () =>
  refusal(
    403,
    'Auth.WrongCredentialKind',
    'this operation does not accept the credential class used to authenticate',
  );
const checkoutRefusal = (status: number, code: string, detail: string) =>
  refusal(status, `CreateSessionCheckout.${code}`, detail);

type PlanSeed = {
  catalog?: PublicCatalog;
  invoices?: SessionInvoice[];
  portal?: SessionPortal;
  /** saas-api refuses every session, as it does an organization it cannot serve. */
  sessionRefusal?: PlanSessionRefusal | null;
};

export type SerializedPlanAppModel = {
  catalog: PublicCatalog;
  invoices: SessionInvoice[];
  portal: SessionPortal;
  problems: Array<[PlanOperation, ArmedBillingProblem]>;
  sequence: number;
  sessionRefusal: PlanSessionRefusal | null;
  sessions: PlanSession[];
  setups: string[];
};

/**
 * The organization's own plan on Kaiten Cloud, behind the Plan & usage page: the
 * session saas-api mints for it, and what Kaiten Cloud's public surface answers that
 * session and the console's publishable key. The portal, the invoices and the
 * catalogue are checked against the contract (`app/openapi.yaml`, whose `/public/*`
 * routes are those of the Kaiten that Kaiten Cloud runs); the credentials are checked
 * as the API checks them, and a checkout refuses in its order, with its codes.
 */
export class PlanAppModel {
  private readonly catalog: PublicCatalog;
  private readonly invoices: SessionInvoice[];
  private portal: SessionPortal;
  private problems: ArmedProblems<PlanOperation>;
  private sequence: number;
  private readonly sessionRefusal: PlanSessionRefusal | null;
  private readonly sessions: PlanSession[];
  private readonly setups: string[];

  constructor(seed: PlanSeed = {}) {
    this.catalog = parseContract(
      zPublicCatalog,
      seed.catalog ?? buildKaitenCloudCatalog(),
      'PlanAppModel.catalog',
    );
    this.portal = parseContract(
      zSessionPortal,
      seed.portal ?? buildKaitenCloudPortal(),
      'PlanAppModel.portal',
    );
    this.invoices = (seed.invoices ?? buildKaitenCloudInvoices()).map(
      (invoice) =>
        parseContract(zSessionInvoice, invoice, 'PlanAppModel.invoices'),
    );
    this.sessionRefusal = seed.sessionRefusal ?? null;
    this.problems = new ArmedProblems();
    this.sequence = 0;
    this.sessions = [];
    this.setups = [];
  }

  static fromSerialized(state: SerializedPlanAppModel): PlanAppModel {
    const model = new PlanAppModel({
      catalog: state.catalog,
      invoices: state.invoices,
      portal: state.portal,
      sessionRefusal: state.sessionRefusal,
    });
    model.problems = ArmedProblems.from(state.problems);
    model.sequence = state.sequence;
    model.sessions.push(...state.sessions);
    model.setups.push(...state.setups);

    return model;
  }

  serializeForMsw(): SerializedPlanAppModel {
    return {
      catalog: structuredClone(this.catalog),
      invoices: structuredClone(this.invoices),
      portal: structuredClone(this.portal),
      problems: this.problems.serialize(),
      sequence: this.sequence,
      sessionRefusal: this.sessionRefusal,
      sessions: structuredClone(this.sessions),
      setups: [...this.setups],
    };
  }

  /** The next call of `operation` (after `after` that go through) is refused with `problem`. */
  armProblem(operation: PlanOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  /** How many sessions saas-api has minted for the page. */
  get sessionsMinted(): number {
    return this.sessions.length;
  }

  // --- saas-api -------------------------------------------------------------------

  /** `POST /plan/session`: a session of 30 minutes, bound to the organization's instance. */
  createSession(now: number): PlanSession {
    this.problems.consume('createPlanSession');
    if (this.sessionRefusal) {
      const { code, detail, status } =
        PLAN_SESSION_REFUSALS[this.sessionRefusal];
      throw new BillingProblem(status, code, detail);
    }
    this.sequence += 1;
    const session = {
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      token: `kst_plan${String(this.sequence).padStart(6, '0')}`,
    };
    this.sessions.push(session);

    return session;
  }

  // --- Kaiten Cloud's public surface ------------------------------------------------

  /**
   * The credential of a `/public/session/*` request, as the API checks it: no
   * publishable key, a bearer, a `kst_`, one that was minted and has not expired.
   */
  authenticateSession(headers: Headers, now: number) {
    if (publishableKeyOf(headers)) {
      throw wrongCredentialKind();
    }
    const bearer = headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) {
      throw invalidCredential();
    }
    if (!bearer.trim().startsWith('kst_')) {
      throw wrongCredentialKind();
    }
    const session = this.sessions.find(({ token }) => token === bearer.trim());
    if (!session || Date.parse(session.expiresAt) <= now) {
      throw invalidCredential();
    }
  }

  /** The credential of `GET /public/catalog`: no bearer, and the one key the console holds. */
  authenticateKey(headers: Headers, knownKey: string) {
    if (headers.get('Authorization')) {
      throw wrongCredentialKind();
    }
    const key = publishableKeyOf(headers);
    if (!key?.startsWith('pk_') || key !== knownKey) {
      throw invalidCredential();
    }
  }

  /** `GET /public/catalog`: one family, and the add-ons unless `include=none`. */
  getCatalog(query: URLSearchParams): PublicCatalog {
    this.problems.consume('getPublicCatalog');
    const familySlug = query.get('familySlug');
    const catalog = structuredClone(this.catalog);

    return {
      ...catalog,
      addOns: query.getAll('include').includes('none') ? [] : catalog.addOns,
      plans: familySlug
        ? catalog.plans.filter((plan) => plan.familySlug === familySlug)
        : catalog.plans,
    };
  }

  /** `GET /public/session/portal`, read now. */
  getPortal(now: number): SessionPortal {
    this.problems.consume('getSessionPortal');

    return {
      ...structuredClone(this.portal),
      updatedAt: new Date(now).toISOString(),
    };
  }

  /** `GET /public/session/invoices`: newest first, fifty to a page unless asked. */
  listInvoices(request: PageRequest) {
    this.problems.consume('listSessionInvoices');

    return pageOfRows(
      structuredClone(this.invoices),
      request,
      'ListSessionInvoices',
    );
  }

  /**
   * `POST /public/session/checkout`, refusing in the API's order: a price of the
   * public catalogue, a flat fee, a plan sold online, add-ons it offers; then the
   * subscribe, which only replaces a free subscription; then, past a preview, a
   * billing e-mail and a card. A card saved on the provider's page is checked by
   * its `setupSessionId`.
   */
  checkout(
    order: SessionCheckoutOrder,
    now: number,
  ): { body: SessionCheckout; status: 200 | 201 } {
    this.problems.consume('createSessionCheckout');
    const { plan, price } = this.findPrice(order.licensePriceId);
    if (order.addOns?.length) {
      throw checkoutRefusal(
        422,
        'AddonNotPublic',
        `"${order.addOns[0].addonSlug}" is not a public add-on that fits this plan`,
      );
    }
    if (!this.holdsNoPaidSubscription()) {
      throw checkoutRefusal(
        409,
        'AlreadySubscribed',
        'this instance already has a live subscription that is not free; a plan change is made by the vendor',
      );
    }
    if (order.voucherCode) {
      throw checkoutRefusal(
        422,
        'VoucherInvalid',
        'this voucher cannot be applied',
      );
    }
    const start = new Date(now);
    const serviceFrom = start.toISOString();
    const serviceTo = periodEnd(start, price.billingPeriod);
    const activation = buildKaitenCloudInvoice({
      id: kaitenCloudId(6, this.invoices.length + 1),
      issuedAt: serviceFrom,
      kind: 'ACTIVATION',
      plan,
      price,
      providerInvoiceNumber: `NW-${String(this.invoices.length + 1).padStart(4, '0')}`,
      serviceFrom,
      serviceTo,
    });
    if (order.dryRun) {
      const { currency, discountTotal, lines, subtotal, total } = activation;
      return {
        body: {
          dueToday: { currency, discountTotal, lines, subtotal, total },
          status: 'preview',
        },
        status: 200,
      };
    }
    if (!this.portal.customer.billingEmail && !order.billingEmail) {
      throw checkoutRefusal(
        422,
        'BillingEmailRequired',
        'the customer has no billing e-mail: send billingEmail',
      );
    }
    const setup = this.paymentMethodStep(order, plan, activation.total, now);
    if (setup) {
      return { body: setup, status: 200 };
    }

    return {
      body: this.subscribe(order, plan, price, activation),
      status: 201,
    };
  }

  private findPrice(licensePriceId: string): {
    plan: PublicPlan;
    price: PublicPrice;
  } {
    for (const plan of this.catalog.plans) {
      const price = plan.prices.find(({ id }) => id === licensePriceId);
      if (!price) {
        continue;
      }
      if (price.billingModel !== 'FLAT_FEE') {
        throw checkoutRefusal(
          422,
          'PriceNotFlatFee',
          'a subscription is bought on a flat-fee price; metered prices come with it',
        );
      }
      if (plan.pricingType === 'CUSTOM') {
        throw checkoutRefusal(
          422,
          'NotSelfServe',
          'this plan is priced on request: send the customer to its selfServeCtaUrl',
        );
      }
      return { plan, price };
    }
    throw checkoutRefusal(
      422,
      'PriceNotPublic',
      'licensePriceId is not an ACTIVE price of a plan in the public catalogue',
    );
  }

  /** No live subscription, or a free one, which a checkout replaces. */
  private holdsNoPaidSubscription() {
    const { subscription } = this.portal;
    return (
      !subscription ||
      subscription.status === 'CANCELED' ||
      (subscription.basePrice.unitAmount ?? 0) === 0
    );
  }

  /** The provider's page that saves a card, when one is needed and none is on file. */
  private paymentMethodStep(
    order: SessionCheckoutOrder,
    plan: PublicPlan,
    dueToday: number,
    now: number,
  ): SessionCheckout | null {
    if (order.setupSessionId) {
      if (!this.setups.includes(order.setupSessionId)) {
        throw checkoutRefusal(
          409,
          'SetupSessionIncomplete',
          'no payment method was saved on that setup page: send the customer back to it, or open a new one',
        );
      }
      this.portal.paymentMethod = {
        brand: 'visa',
        expMonth: 8,
        expYear: 2028,
        last4: '4242',
        status: 'ACTIVE',
      };
      return null;
    }
    const needsMethod = dueToday > 0 || plan.requiresPaymentMethod;
    if (!needsMethod || this.portal.paymentMethod?.status === 'ACTIVE') {
      return null;
    }
    if (!order.returnUrl) {
      throw checkoutRefusal(
        422,
        'InvalidReturnUrl',
        'a payment method has to be saved first: send the returnUrl the setup page brings the customer back to',
      );
    }
    this.sequence += 1;
    const setupSessionId = `seti_plan${String(this.sequence).padStart(6, '0')}`;
    this.setups.push(setupSessionId);

    return {
      expiresAt: new Date(now + SETUP_TTL_MS).toISOString(),
      setupSessionId,
      setupUrl: `https://billing.kaiten-cloud.test/setup/${setupSessionId}`,
      status: 'requires_payment_method',
    };
  }

  /**
   * The instance moves to the plan, its free subscription is replaced, and the
   * invoice of the first period is charged to the card at once.
   */
  private subscribe(
    order: SessionCheckoutOrder,
    plan: PublicPlan,
    price: PublicPrice,
    activation: SessionInvoice,
  ): SessionCheckout {
    const subscription = buildKaitenCloudSubscription(
      price,
      activation.serviceFrom,
      activation.serviceTo,
    );
    const known = KAITEN_CLOUD_PLANS.find(
      (each) => each.plan.licenseSlug === plan.licenseSlug,
    );
    const owes = activation.total > 0;
    this.portal = {
      ...this.portal,
      capabilities: { ...this.portal.capabilities, checkout: !owes },
      customer: {
        ...this.portal.customer,
        billingEmail: order.billingEmail ?? this.portal.customer.billingEmail,
      },
      entitlements: known ? buildKaitenCloudEntitlements(known) : [],
      instance: this.portal.instance && {
        ...this.portal.instance,
        licenseName: plan.name,
        licenseSlug: plan.licenseSlug,
      },
      subscription,
      upcomingInvoice: {
        boundaryAt: activation.serviceTo,
        currency: activation.currency,
        discountTotal: 0,
        subtotal: activation.total,
        total: activation.total,
      },
    };
    if (owes) {
      this.invoices.unshift(activation);
    }

    return {
      ...(owes ? { activationInvoice: activation } : {}),
      payment: { status: owes ? 'paid' : 'not_required' },
      status: 'subscribed',
      subscription,
    };
  }
}

/** The publishable key a request carries, under the header the API reads first. */
function publishableKeyOf(headers: Headers): string | null {
  return (
    headers.get('Kaiten-Publishable-Key')?.trim() ||
    headers.get('X-Kaiten-Publishable-Key')?.trim() ||
    null
  );
}
