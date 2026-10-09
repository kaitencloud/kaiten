import { z } from 'zod';
import type {
  InstanceBilling,
  Price,
  Redemption,
  Validity,
  Voucher,
  VoucherCheck,
  VoucherDraft,
} from '@/api-client';
import { zRedemption, zVoucher } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { BillingProblem } from './billing-problem';
import type { DiscountSource } from './billing-discounts';
import {
  applicationsMaxOf,
  boostEnd,
  checkDraft,
  checkDuplicateGrants,
  instanceRefusal,
  isInForce,
  onlyActiveMembersChange,
  type PlannedSubscription,
  type RedeemingInstance,
  redeemProblem,
  sameCode,
  type VoucherReferences,
  windowRefusal,
} from './billing-voucher-rules';
import { voucherCodeHint } from '../fixtures/build-voucher';

const clone = <T>(value: T): T => structuredClone(value);

/** A record of the contract the model changes in place: the contract marks its generated members readonly. */
type Editable<T> = { -readonly [K in keyof T]: T[K] };

/** What the mocks arm to fail with a problem document, once. */
export type VoucherOperation =
  | 'archiveVoucher'
  | 'createVoucher'
  | 'getVoucher'
  | 'listInstanceVouchers'
  | 'listVoucherRedemptions'
  | 'listVouchers'
  | 'lookupVoucher'
  | 'publishVoucher'
  | 'redeemVoucher'
  | 'revokeInstanceVoucher'
  | 'updateVoucher'
  | 'validateVoucher';

export type BillingVouchersSeed = {
  /** What the world holds that a voucher may name, beyond what the billing slot knows. */
  known?: {
    customers?: string[];
    licenseIds?: string[];
  };
  redemptions?: Redemption[];
  vouchers?: Voucher[];
};

export type SerializedBillingVouchers = {
  armedProblems: Array<[VoucherOperation, ArmedBillingProblem]>;
  known: { customers: string[]; licenseIds: string[] };
  redemptions: Redemption[];
  sequence: number;
  vouchers: Voucher[];
};

/** What the vouchers need of the rest of the organization to answer as the API does. */
export type VoucherWorld = VoucherReferences & {
  /** The instance a voucher is redeemed for, or nothing when the organization has none by that slug. */
  instance(slug: string): RedeemingInstance | undefined;
  now(): number;
  /** The flat-fee price a subscription would start on and the id of its version, or nothing when no flat-fee price has that id. */
  plan(priceId: string): { licenseId?: string; price: Price } | undefined;
};

/**
 * What a boost redeemed by an instance changes of one of its entitlements, with which
 * redemption and voucher it is and the window it applies in: the provenance of the
 * effective value names them, and never the code.
 */
export type BoostContribution = {
  effectiveExpiresAt?: string;
  effectiveStartsAt: string;
  entitlementSlug: string;
  instanceVoucherId: string;
  modifierType: 'ADD' | 'MULTIPLY' | 'SET' | 'UNLIMITED';
  redeemedAt: string;
  value?: number;
  voucherEntitlementGrantId: string;
  voucherId: string;
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A generated code: 16 Crockford characters, derived from the sequence so that a spec can rely on its shape. */
const generateCode = (sequence: number): string => {
  let state = (sequence * 2654435761) >>> 0 || 1;
  let code = '';
  for (let index = 0; index < 16; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    code += CROCKFORD[(state >>> 27) % CROCKFORD.length];
  }

  return code;
};

/** A decimal as the API writes it back: `30.50` is `30.5`, `30.0` is `30`. */
const formatDecimal = (decimal: string): string =>
  decimal.includes('.') ? decimal.replace(/\.?0+$/, '') : decimal;

const denied = (code: string, detail: string, status = 404) =>
  new BillingProblem(status, code, detail);

/**
 * The vouchers of the organization and what instances redeemed of them, as the Core
 * API serves them (api/internal/modules/vouchers): the same checks in the same order
 * with the same codes, so that the console is exercised against the reasons it will
 * really be given, and the same quirks it must work around -- the API never sets a
 * voucher EXPIRED itself, an update of an ACTIVE voucher writes the rules and the
 * description it is given and ignores a changed grant. A redemption changes what the
 * rest of the model answers: its voucher's count, the effective values of the
 * instance for a boost and the next invoice for a discount.
 */
export class BillingVouchers {
  private readonly problems = new ArmedProblems<VoucherOperation>();
  private known: { customers: string[]; licenseIds: string[] };
  private redemptions: Redemption[];
  private sequence = 1;
  private vouchers: Editable<Voucher>[];
  private world: VoucherWorld = {
    entitlementType: () => undefined,
    hasAddon: () => false,
    hasAddonPrice: () => false,
    hasCustomer: () => false,
    hasLicense: () => false,
    hasLicensePrice: () => false,
    instance: () => undefined,
    now: () => Date.now(),
    plan: () => undefined,
  };

  constructor(seed: BillingVouchersSeed = {}) {
    this.vouchers = parseContract(
      z.array(zVoucher),
      seed.vouchers ?? [],
      'BillingVouchers seed.vouchers',
    ).map(clone);
    this.redemptions = parseContract(
      z.array(zRedemption),
      seed.redemptions ?? [],
      'BillingVouchers seed.redemptions',
    ).map(clone);
    this.known = {
      customers: [...(seed.known?.customers ?? [])],
      licenseIds: [...(seed.known?.licenseIds ?? [])],
    };
  }

  static fromSerialized(state: SerializedBillingVouchers): BillingVouchers {
    const model = new BillingVouchers({
      known: state.known,
      redemptions: state.redemptions,
      vouchers: state.vouchers,
    });
    model.sequence = state.sequence;
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingVouchers {
    return {
      armedProblems: this.problems.serialize(),
      known: clone(this.known),
      redemptions: clone(this.redemptions),
      sequence: this.sequence,
      vouchers: clone(this.vouchers),
    };
  }

  /** Where the vouchers learn the instances, the catalogue and the clock: they are other parts of the model. */
  setWorld(world: VoucherWorld) {
    this.world = world;
  }

  /** What the seed says exists besides what the billing slot knows. */
  knows(): { customers: readonly string[]; licenseIds: readonly string[] } {
    return this.known;
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: VoucherOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  /** Every voucher and redemption, for a spec that asserts what the model holds. */
  snapshot(): { redemptions: Redemption[]; vouchers: Voucher[] } {
    return {
      redemptions: clone(this.redemptions),
      vouchers: clone(this.vouchers),
    };
  }

  private nowIso(): string {
    return new Date(this.world.now()).toISOString();
  }

  private find(id: string): Editable<Voucher> | undefined {
    return this.vouchers.find((voucher) => voucher.id === id);
  }

  private findByCode(code: string): Editable<Voucher> | undefined {
    return this.vouchers.find(
      (voucher) => voucher.code !== undefined && sameCode(voucher.code, code),
    );
  }

  private require(id: string, operation: string): Editable<Voucher> {
    const voucher = this.find(id);
    if (!voucher) {
      throw denied(`${operation}.NotFound`, `voucher ${id} not found`);
    }

    return voucher;
  }

  /** A voucher as a caller who may read vouchers sees it, or without its code. */
  private view(voucher: Voucher, withCode: boolean): Voucher {
    const view = clone(voucher);
    if (!withCode) {
      delete view.code;
    }

    return view;
  }

  // --- The catalogue -----------------------------------------------------------------

  /** `GET /vouchers`: newest first, with the codes. */
  listVouchers(
    filter: {
      restrictedCustomerSlug?: string;
      status?: Voucher['status'];
      voucherType?: Voucher['voucherType'];
    } = {},
  ): Voucher[] {
    this.problems.consume('listVouchers');

    return this.vouchers
      .filter(
        (voucher) =>
          (!filter.status || voucher.status === filter.status) &&
          (!filter.voucherType || voucher.voucherType === filter.voucherType) &&
          (!filter.restrictedCustomerSlug ||
            voucher.restrictedCustomerSlug === filter.restrictedCustomerSlug),
      )
      .sort(
        (a, b) =>
          Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
          b.id.localeCompare(a.id),
      )
      .map((voucher) => this.view(voucher, true));
  }

  /** `GET /vouchers/{voucherId}`. */
  getVoucher(id: string): Voucher {
    this.problems.consume('getVoucher');

    return this.view(this.require(id, 'GetVoucher'), true);
  }

  /** `POST /vouchers`: a DRAFT. */
  createVoucher(draft: VoucherDraft): Voucher {
    this.problems.consume('createVoucher');
    checkDraft(draft, 'CreateVoucher', this.references());
    const code = draft.code ?? generateCode(this.sequence);
    if (this.findByCode(code)) {
      throw denied(
        'CreateVoucher.CodeConflict',
        'another voucher has this code, compared without case or separators',
        409,
      );
    }
    checkDuplicateGrants(draft.grants, 'CreateVoucher');
    const at = this.nowIso();
    const voucher = parseContract(
      zVoucher,
      this.toVoucher(draft, code, {
        createdAt: at,
        id: `voucher-${this.sequence}`,
        redemptionsCount: 0,
        status: 'DRAFT',
        updatedAt: at,
      }),
      'BillingVouchers createVoucher',
    );
    this.sequence += 1;
    this.vouchers.push(voucher);

    return this.view(voucher, true);
  }

  /** `PUT /vouchers/{voucherId}`: a DRAFT in full, an ACTIVE voucher in four members. */
  updateVoucher(id: string, draft: VoucherDraft): Voucher {
    this.problems.consume('updateVoucher');
    const stored = this.require(id, 'UpdateVoucher');
    if (draft.voucherType !== stored.voucherType) {
      throw denied(
        'UpdateVoucher.NotEditable',
        "a voucher's type never changes",
        409,
      );
    }
    const next: VoucherDraft = { ...draft, code: draft.code ?? stored.code };
    if (stored.status === 'ACTIVE') {
      if (!onlyActiveMembersChange(stored, next)) {
        throw denied(
          'UpdateVoucher.NotEditable',
          'an active voucher takes a new name, description, expiresAt and maxRedemptions only',
          409,
        );
      }
      if (
        next.maxRedemptions !== undefined &&
        next.maxRedemptions < stored.redemptionsCount
      ) {
        throw denied(
          'UpdateVoucher.MaxRedemptionsBelowCount',
          'maxRedemptions is below the redemptions already made',
          409,
        );
      }
    } else if (stored.status !== 'DRAFT') {
      throw denied(
        'UpdateVoucher.NotEditable',
        'only a DRAFT or ACTIVE voucher can be changed',
        409,
      );
    }
    checkDraft(next, 'UpdateVoucher', this.references());
    const code = next.code ?? stored.code ?? generateCode(this.sequence);
    if (
      this.vouchers.some(
        (other) =>
          other.id !== id &&
          other.code !== undefined &&
          sameCode(other.code, code),
      )
    ) {
      throw denied(
        'UpdateVoucher.CodeConflict',
        'another voucher has this code, compared without case or separators',
        409,
      );
    }
    if (stored.status === 'DRAFT') {
      checkDuplicateGrants(next.grants, 'UpdateVoucher');
    }
    const written = this.toVoucher(next, code, {
      createdAt: stored.createdAt,
      id: stored.id,
      redemptionsCount: stored.redemptionsCount,
      status: stored.status,
      updatedAt: this.nowIso(),
    });
    // The grants of a voucher that is no longer a draft are not rewritten.
    if (stored.status !== 'DRAFT') {
      written.grants = clone(stored.grants);
    }
    const voucher = parseContract(
      zVoucher,
      written,
      'BillingVouchers updateVoucher',
    );
    this.vouchers = this.vouchers.map((other) =>
      other.id === id ? voucher : other,
    );

    return this.view(voucher, true);
  }

  /** The voucher a draft and a few stored members make. */
  private toVoucher(
    draft: VoucherDraft,
    code: string,
    stored: Pick<
      Voucher,
      'createdAt' | 'id' | 'redemptionsCount' | 'status' | 'updatedAt'
    >,
  ): Voucher {
    const isPrice = draft.voucherType === 'PRICE';

    return {
      applicableAddonIds: [...(draft.applicableAddonIds ?? [])],
      applicableAddonPriceIds: isPrice
        ? [...(draft.applicableAddonPriceIds ?? [])]
        : [],
      applicableLicenseIds: [...(draft.applicableLicenseIds ?? [])],
      applicableLicensePriceIds: isPrice
        ? [...(draft.applicableLicensePriceIds ?? [])]
        : [],
      code,
      codeHint: voucherCodeHint(code),
      createdAt: stored.createdAt,
      currency: draft.currency,
      description: draft.description,
      duration: draft.duration,
      durationInPeriods: draft.durationInPeriods,
      expiresAt: draft.expiresAt,
      grants: (draft.grants ?? []).map((grant) => ({
        entitlementSlug: grant.entitlementSlug,
        modifierType: grant.modifierType,
        modifierValue:
          grant.modifierValue === undefined
            ? undefined
            : formatDecimal(grant.modifierValue),
      })),
      id: stored.id,
      maxRedemptions: draft.maxRedemptions,
      name: draft.name,
      priceAppliesTo: draft.priceAppliesTo,
      priceDiscountType: draft.priceDiscountType,
      priceDiscountValue:
        draft.priceDiscountValue === undefined
          ? undefined
          : formatDecimal(draft.priceDiscountValue),
      redemptionRules: clone(draft.redemptionRules ?? {}),
      redemptionsCount: stored.redemptionsCount,
      restrictedCustomerSlug: draft.restrictedCustomerSlug,
      startsAt: draft.startsAt,
      status: stored.status,
      updatedAt: stored.updatedAt,
      voucherType: draft.voucherType,
    };
  }

  /** `POST /vouchers/{voucherId}/publish`. */
  publishVoucher(id: string): Voucher {
    this.problems.consume('publishVoucher');
    const voucher = this.require(id, 'PublishVoucher');
    if (voucher.status !== 'DRAFT') {
      throw denied(
        'PublishVoucher.NotADraft',
        'only a DRAFT voucher can be published',
        409,
      );
    }

    return this.setStatus(voucher, 'ACTIVE');
  }

  /** `POST /vouchers/{voucherId}/archive`. */
  archiveVoucher(id: string): Voucher {
    this.problems.consume('archiveVoucher');
    const voucher = this.require(id, 'ArchiveVoucher');
    if (voucher.status === 'ARCHIVED') {
      throw denied(
        'ArchiveVoucher.AlreadyArchived',
        'the voucher is already archived',
        409,
      );
    }

    return this.setStatus(voucher, 'ARCHIVED');
  }

  private setStatus(
    voucher: Editable<Voucher>,
    status: Voucher['status'],
  ): Voucher {
    voucher.status = status;
    voucher.updatedAt = this.nowIso();

    return this.view(voucher, true);
  }

  /** `POST /vouchers/lookup`: the voucher a code names, with its code. */
  lookupVoucher(code: string): Voucher {
    this.problems.consume('lookupVoucher');
    const voucher = this.findByCode(code);
    if (!voucher) {
      throw denied('LookupVoucher.NotFound', 'no voucher has this code');
    }

    return this.view(voucher, true);
  }

  // --- Validating and redeeming --------------------------------------------------------

  private references(): VoucherReferences {
    return {
      ...this.world,
      hasCustomer: (slug) =>
        this.world.hasCustomer(slug) || this.known.customers.includes(slug),
      hasLicense: (id) =>
        this.world.hasLicense(id) || this.known.licenseIds.includes(id),
    };
  }

  private redeemedAlready(instanceSlug: string, voucherId: string): boolean {
    return this.redemptions.some(
      (redemption) =>
        redemption.instanceSlug === instanceSlug &&
        redemption.voucherId === voucherId,
    );
  }

  /**
   * The first check a redemption of `voucher` by `instance` fails, if any. A `subscription` is
   * the one the checks that read it must see in place of the instance's: the one a subscribe
   * is about to write, or the one a price would start. A price also moves the instance to the
   * version it belongs to, as the API reads it.
   */
  private refusalFor(
    voucher: Voucher,
    instanceSlug: string | undefined,
    subscription?: PlannedSubscription,
    licenseId?: string,
  ) {
    const window = windowRefusal(voucher, this.world.now());
    if (window || instanceSlug === undefined) {
      return window;
    }
    const instance = this.world.instance(instanceSlug);
    if (!instance) {
      return undefined;
    }

    return instanceRefusal(
      voucher,
      subscription
        ? {
            ...instance,
            licenseId: licenseId ?? instance.licenseId,
            subscription,
          }
        : instance,
      this.redeemedAlready(instanceSlug, voucher.id),
      this.world.entitlementType,
    );
  }

  /**
   * `POST /vouchers/validate`: whether a code would redeem, and why not. With a
   * `licensePriceId` the licence, period, amount and currency checks read the subscription
   * that flat-fee price would start, and not the instance's own (404
   * `ValidateVoucher.PriceNotFound` for a price that is no flat fee of the organization). The
   * price is read with the instance: the checks that need the instance are skipped when none
   * is named, and so is the price, which only changes how the instance is read. The limit of
   * sixty checks a minute is armed by a spec (`VALIDATION_RATE_LIMITED`), not counted.
   */
  validate(check: VoucherCheck): Validity {
    this.problems.consume('validateVoucher');
    const voucher = this.findByCode(check.code);
    if (
      check.instanceSlug !== undefined &&
      !this.world.instance(check.instanceSlug)
    ) {
      throw denied(
        'ValidateVoucher.InstanceNotFound',
        `instance "${check.instanceSlug}" not found`,
      );
    }
    const plan =
      check.licensePriceId === undefined
        ? undefined
        : this.world.plan(check.licensePriceId);
    if (check.licensePriceId !== undefined && !plan) {
      throw denied(
        'ValidateVoucher.PriceNotFound',
        `no flat-fee licence price ${check.licensePriceId}`,
      );
    }
    if (!voucher) {
      return { reason: 'NOT_FOUND', valid: false };
    }
    const refusal = this.refusalFor(
      voucher,
      check.instanceSlug,
      plan && {
        basePrice: plan.price,
        billingPeriod: plan.price.billingPeriod ?? 'MONTHLY',
        currency: plan.price.currency,
      },
      plan?.licenseId,
    );
    const seen = this.view(voucher, false);
    if (refusal) {
      return {
        reason: refusal.reason,
        rule: refusal.rule,
        valid: false,
        voucher: seen,
      };
    }

    return { valid: true, voucher: seen };
  }

  /**
   * The checks of a redemption, in the order the API makes them; `subscription`
   * stands for the one a subscribe is about to write, which the rules that read the
   * subscription must see. Throws the refusal.
   */
  private checkRedeem(
    operation: string,
    instanceSlug: string,
    code: string,
    subscription?: InstanceBilling,
  ): Voucher {
    if (!this.world.instance(instanceSlug)) {
      throw denied(
        `${operation}.InstanceNotFound`,
        `instance "${instanceSlug}" not found`,
      );
    }
    const voucher = this.findByCode(code);
    if (!voucher) {
      throw redeemProblem({ reason: 'NOT_FOUND' }, operation);
    }
    const refusal = this.refusalFor(voucher, instanceSlug, subscription);
    if (refusal) {
      throw redeemProblem(refusal, operation);
    }

    return voucher;
  }

  /** The redemption a voucher makes for an instance now, claimed on the voucher. */
  private claim(
    voucher: Editable<Voucher>,
    instanceSlug: string,
    subscription: Pick<InstanceBilling, 'billingPeriod'> | undefined,
  ): Redemption {
    const now = new Date(this.world.now());
    voucher.redemptionsCount += 1;
    if (
      voucher.maxRedemptions !== undefined &&
      voucher.redemptionsCount >= voucher.maxRedemptions
    ) {
      voucher.status = 'EXHAUSTED';
    }
    voucher.updatedAt = now.toISOString();
    const redemption = parseContract(
      zRedemption,
      {
        applicationsCount: 0,
        applicationsMax:
          voucher.voucherType === 'PRICE'
            ? applicationsMaxOf(voucher)
            : undefined,
        codeHint: voucher.codeHint,
        effectiveExpiresAt: boostEnd(voucher, now, subscription),
        effectiveStartsAt: now.toISOString(),
        id: `redemption-${this.sequence}`,
        instanceSlug,
        redeemedAt: now.toISOString(),
        status: 'ACTIVE' as const,
        voucherId: voucher.id,
        voucherName: voucher.name,
        voucherType: voucher.voucherType,
      },
      'BillingVouchers redeem',
    );
    this.sequence += 1;
    this.redemptions.push(redemption);

    return redemption;
  }

  /** `POST /instances/{instanceSlug}/vouchers/redeem`. */
  redeem(instanceSlug: string, code: string): Redemption {
    this.problems.consume('redeemVoucher');
    const voucher = this.checkRedeem('RedeemVoucher', instanceSlug, code);

    return clone(
      this.claim(
        voucher,
        instanceSlug,
        this.world.instance(instanceSlug)?.subscription,
      ),
    );
  }

  /**
   * A subscribe redeems the code it was given in its own step: the rules that read the
   * subscription see the one being started. Returns what to do once the subscribe is
   * past its other checks, so that a refusal leaves nothing behind.
   */
  checkForSubscription(
    instanceSlug: string,
    code: string,
    subscription: InstanceBilling,
  ): () => Redemption {
    this.problems.consume('redeemVoucher');
    const voucher = this.checkRedeem(
      'RedeemVoucher',
      instanceSlug,
      code,
      subscription,
    );

    return () => clone(this.claim(voucher, instanceSlug, subscription));
  }

  /** `POST /instances/{instanceSlug}/vouchers/{instanceVoucherId}/revoke`. */
  revoke(
    instanceSlug: string,
    redemptionId: string,
    reason: string,
  ): Redemption {
    this.problems.consume('revokeInstanceVoucher');
    if (reason.trim() === '') {
      throw denied(
        'RevokeInstanceVoucher.ReasonRequired',
        'a revocation gives its reason',
        422,
      );
    }
    if (!this.world.instance(instanceSlug)) {
      throw denied(
        'RevokeInstanceVoucher.NotFound',
        `instance "${instanceSlug}" not found`,
      );
    }
    const redemption = this.redemptions.find(
      (candidate) =>
        candidate.id === redemptionId &&
        candidate.instanceSlug === instanceSlug,
    );
    if (!redemption) {
      throw denied(
        'RevokeInstanceVoucher.NotFound',
        `redemption ${redemptionId} not found`,
      );
    }
    if (redemption.status !== 'ACTIVE') {
      throw denied(
        'RevokeInstanceVoucher.NotActive',
        'only an ACTIVE redemption can be revoked',
        409,
      );
    }
    redemption.status = 'REVOKED';
    redemption.revokedAt = this.nowIso();
    redemption.revokedReason = reason;

    return clone(redemption);
  }

  // --- Redemptions ---------------------------------------------------------------------

  private newestFirst(redemptions: Redemption[]): Redemption[] {
    return redemptions
      .map(clone)
      .sort(
        (a, b) =>
          Date.parse(b.redeemedAt) - Date.parse(a.redeemedAt) ||
          b.id.localeCompare(a.id),
      );
  }

  /** `GET /vouchers/{voucherId}/redemptions`. */
  listRedemptions(voucherId: string): Redemption[] {
    this.problems.consume('listVoucherRedemptions');
    if (!this.find(voucherId)) {
      throw denied(
        'ListVoucherRedemptions.VoucherNotFound',
        `voucher ${voucherId} not found`,
      );
    }

    return this.newestFirst(
      this.redemptions.filter(
        (redemption) => redemption.voucherId === voucherId,
      ),
    );
  }

  /** `GET /instances/{instanceSlug}/vouchers`. */
  listInstanceVouchers(
    instanceSlug: string,
    status?: Redemption['status'],
  ): Redemption[] {
    this.problems.consume('listInstanceVouchers');
    if (!this.world.instance(instanceSlug)) {
      throw denied(
        'ListInstanceVouchers.InstanceNotFound',
        `instance "${instanceSlug}" not found`,
      );
    }

    return this.newestFirst(
      this.redemptions.filter(
        (redemption) =>
          redemption.instanceSlug === instanceSlug &&
          (!status || redemption.status === status),
      ),
    );
  }

  // --- What the rest of the model reads --------------------------------------------------

  /** The redemptions of an instance that discount its invoices, with their vouchers. */
  discountSourcesOf(instanceSlug: string): DiscountSource[] {
    return this.redemptions
      .filter(
        (redemption) =>
          redemption.instanceSlug === instanceSlug &&
          redemption.voucherType === 'PRICE',
      )
      .flatMap((redemption) => {
        const voucher = this.find(redemption.voucherId);

        return voucher
          ? [{ redemption: clone(redemption), voucher: clone(voucher) }]
          : [];
      });
  }

  /** An invoice was composed with a DISCOUNT line for each of these: they used one more of their invoices. */
  consume(redemptionIds: readonly string[]) {
    for (const id of redemptionIds) {
      const redemption = this.redemptions.find(
        (candidate) => candidate.id === id,
      );
      if (!redemption) {
        continue;
      }
      redemption.applicationsCount += 1;
      if (
        redemption.applicationsMax !== undefined &&
        redemption.applicationsCount >= redemption.applicationsMax
      ) {
        redemption.status = 'EXPIRED';
        redemption.expiredAt = this.nowIso();
      }
    }
  }

  /** What the boosts an instance redeemed change of its entitlements at `at` (now), in the order they were redeemed. */
  boostsOf(
    instanceSlug: string,
    now: number = this.world.now(),
  ): BoostContribution[] {
    return this.redemptions
      .filter(
        (redemption) =>
          redemption.instanceSlug === instanceSlug &&
          redemption.voucherType === 'ENTITLEMENT_BOOST' &&
          isInForce(redemption, now),
      )
      .sort((a, b) => Date.parse(a.redeemedAt) - Date.parse(b.redeemedAt))
      .flatMap((redemption) =>
        (this.find(redemption.voucherId)?.grants ?? []).map((grant) => ({
          effectiveExpiresAt: redemption.effectiveExpiresAt,
          effectiveStartsAt: redemption.effectiveStartsAt,
          entitlementSlug: grant.entitlementSlug,
          instanceVoucherId: redemption.id,
          modifierType: grant.modifierType,
          redeemedAt: redemption.redeemedAt,
          value:
            grant.modifierValue === undefined
              ? undefined
              : Number(grant.modifierValue),
          voucherEntitlementGrantId: `${redemption.voucherId}-${grant.entitlementSlug}`,
          voucherId: redemption.voucherId,
        })),
      );
  }
}
