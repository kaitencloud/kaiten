import { z } from 'zod';
import type {
  Entitlement,
  License,
  LicenseEntitlement,
  LicenseEntitlementWritable,
  LicensePriceChanges,
  NewLicensePrice,
  Price,
} from '@/api-client';
import { zLicenseEntitlement, zPrice } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { TEST_USER } from '../fixtures/build-customer';
import { NULL_OBJECT } from '../fixtures/null-object';
import { formatDecimal, parseDecimal } from './decimal';
import { composeLicenseInvoicePreview } from './license-invoice-preview';
import {
  checkMeters,
  checkShape,
  isMetered,
  type PriceDraft,
} from './license-price-rules';
import { LicenseProblem } from './license-problem';

const clone = <T>(value: T): T => structuredClone(value);

// The generated read types mark server-owned fields readonly; the model is the
// server here, so it keeps its rows writable.
type PriceRecord = { -readonly [K in keyof Price]: Price[K] };
type GrantRecord = {
  -readonly [K in keyof LicenseEntitlement]: LicenseEntitlement[K];
};

/** What a mock of the license module arms to fail with a problem document, once. */
export type PricingProblemOperation =
  | 'associateGrant'
  | 'createPrice'
  | 'deleteGrant'
  | 'deprecatePrice'
  | 'previewInvoice'
  | 'updateGrant'
  | 'updatePrice';

export type ArmedProblem = {
  /** How many calls of the operation go through before the one that fails. */
  after?: number;
  code: string;
  detail: string;
  status: number;
};

/** What the pricing of the versions needs of the catalogue that owns them. */
export type PricingHost = {
  entitlements(): Entitlement[];
  findLicense(slug: string): License;
  nextTimestamp(): string;
  now(): Date;
};

export type PricingSeed = {
  /** The slugs of the versions a live subscription bills: what they sell is frozen. */
  billedVersions?: string[];
  /** What the versions grant. */
  grants?: LicenseEntitlement[];
  /** The prices of each version, by slug. */
  prices?: Record<string, Price[]>;
};

export type SerializedPricing = {
  armedProblems: Array<[PricingProblemOperation, ArmedProblem]>;
  billedVersions: string[];
  grants: LicenseEntitlement[];
  prices: Record<string, Price[]>;
  sequence: number;
};

const slugOf = (entitlement: Entitlement) => entitlement.slug ?? entitlement.id;

/**
 * What a license version sells: the grants it makes, the prices it bills and
 * whether a live subscription freezes them. It answers as the Core API does,
 * refusals and their codes included (api/internal/modules/licenses), so that the
 * console is exercised against the reasons it will really be given.
 */
export class LicensePricing {
  private armed = new Map<PricingProblemOperation, ArmedProblem>();
  private billed: Set<string>;
  private grants: GrantRecord[];
  private prices: Map<string, PriceRecord[]>;
  private sequence: number;

  constructor(
    private readonly host: PricingHost,
    seed: PricingSeed = {},
  ) {
    this.grants = parseContract(
      z.array(zLicenseEntitlement),
      seed.grants ?? [],
      'LicensePricing seed.grants',
    );
    this.prices = new Map(
      Object.entries(seed.prices ?? {}).map(([slug, prices]) => [
        slug,
        parseContract(
          z.array(zPrice),
          prices,
          `LicensePricing seed.prices[${slug}]`,
        ),
      ]),
    );
    this.billed = new Set(seed.billedVersions ?? []);
    this.sequence =
      1 +
      Math.max(
        0,
        ...[...this.prices.values()]
          .flat()
          .map((price) => Number(/(\d+)$/.exec(price.id)?.[1] ?? 0)),
      );
  }

  static fromSerialized(host: PricingHost, state: SerializedPricing) {
    const pricing = new LicensePricing(host, {
      billedVersions: state.billedVersions,
      grants: state.grants,
      prices: state.prices,
    });
    pricing.sequence = state.sequence;
    pricing.armed = new Map(state.armedProblems);

    return pricing;
  }

  serialize(): SerializedPricing {
    return {
      armedProblems: [...this.armed.entries()],
      billedVersions: [...this.billed],
      grants: clone(this.grants),
      prices: Object.fromEntries(
        [...this.prices.entries()].map(([slug, prices]) => [
          slug,
          clone(prices),
        ]),
      ),
      sequence: this.sequence,
    };
  }

  /** Arm the next call to `operation` to fail with a problem document. One-shot. */
  armProblem(operation: PricingProblemOperation, problem: ArmedProblem) {
    this.armed.set(operation, problem);
  }

  /** Makes a version billed by a live subscription: what it sells is frozen. */
  markBilled(slug: string) {
    this.billed.add(slug);
  }

  private consume(operation: PricingProblemOperation) {
    const problem = this.armed.get(operation);
    if (!problem) {
      return;
    }
    if ((problem.after ?? 0) > 0) {
      // Let this call through: a copy that stops halfway is one that fails late.
      this.armed.set(operation, {
        ...problem,
        after: (problem.after ?? 0) - 1,
      });

      return;
    }
    this.armed.delete(operation);
    throw new LicenseProblem(problem.status, problem.code, problem.detail);
  }

  private refuseBilled(operation: string, slug: string) {
    if (this.billed.has(slug)) {
      throw new LicenseProblem(
        409,
        `${operation}.BillingActive`,
        'a live subscription bills this licence version: what it sells is frozen; publish a new version instead',
      );
    }
  }

  private catalogueOf(entitlementSlug: string): Entitlement | undefined {
    return this.host
      .entitlements()
      .find((entitlement) => slugOf(entitlement) === entitlementSlug);
  }

  // --- What a version grants ------------------------------------------------

  listGrants(slug: string): LicenseEntitlement[] {
    this.host.findLicense(slug);

    return clone(this.grants.filter((grant) => grant.licenseSlug === slug));
  }

  associateGrant(slug: string, body: LicenseEntitlementWritable) {
    this.consume('associateGrant');
    const license = this.host.findLicense(slug);
    this.refuseBilled('AssociateEntitlementToLicense', slug);
    const entitlement = this.catalogueOf(body.entitlementSlug ?? '');
    if (!entitlement) {
      throw new LicenseProblem(
        404,
        'AssociateEntitlementToLicense.EntitlementNotFound',
        `entitlement "${body.entitlementSlug}" not found`,
      );
    }
    if (
      this.grants.some(
        (grant) =>
          grant.licenseSlug === slug &&
          grant.entitlementSlug === slugOf(entitlement),
      )
    ) {
      throw new LicenseProblem(
        409,
        'AssociateEntitlementToLicense.AlreadyAssociated',
        'this entitlement is already granted by the license',
      );
    }
    const timestamp = this.host.nextTimestamp();
    this.grants.push(
      parseContract(
        zLicenseEntitlement,
        {
          createdAt: timestamp,
          createdBy: TEST_USER,
          entitlementName: entitlement.name,
          entitlementSlug: slugOf(entitlement),
          entitlementType:
            entitlement.type === 'NUMBER_AI_CREDIT'
              ? 'NUMBER'
              : entitlement.type,
          licenseId: license.id,
          licenseSlug: slug,
          limitCapExceededOveragePercent: body.limitCapExceededOveragePercent,
          updatedAt: timestamp,
          updatedBy: TEST_USER,
          value: body.value,
        },
        'LicensePricing.associateGrant result',
      ),
    );
  }

  updateGrant(
    slug: string,
    entitlementSlug: string,
    body: LicenseEntitlementWritable,
  ) {
    this.consume('updateGrant');
    this.host.findLicense(slug);
    this.refuseBilled('UpdateLicenseEntitlement', slug);
    const grant = this.grants.find(
      (candidate) =>
        candidate.licenseSlug === slug &&
        candidate.entitlementSlug === entitlementSlug,
    );
    if (!grant) {
      throw new LicenseProblem(
        404,
        'UpdateLicenseEntitlement.NotFound',
        `entitlement "${entitlementSlug}" is not granted by this license`,
      );
    }
    grant.value = body.value;
    grant.limitCapExceededOveragePercent = body.limitCapExceededOveragePercent;
    grant.updatedAt = this.host.nextTimestamp();
  }

  deleteGrant(slug: string, entitlementSlug: string) {
    this.consume('deleteGrant');
    this.host.findLicense(slug);
    this.refuseBilled('DeleteLicenseEntitlement', slug);
    this.refuseMeteredGrant(slug, entitlementSlug);
    const index = this.grants.findIndex(
      (candidate) =>
        candidate.licenseSlug === slug &&
        candidate.entitlementSlug === entitlementSlug,
    );
    if (index < 0) {
      throw new LicenseProblem(
        404,
        'DeleteLicenseEntitlement.NotFound',
        `entitlement "${entitlementSlug}" is not granted by this license`,
      );
    }
    this.grants.splice(index, 1);
  }

  // A grant an ACTIVE price meters stays: the price would go on metering an
  // entitlement the version no longer grants. The price is deprecated first, on
  // a draft as on a published version.
  private refuseMeteredGrant(slug: string, entitlementSlug: string) {
    const isMetered = this.pricesOf(slug).some(
      (price) =>
        price.status === 'ACTIVE' &&
        price.metered?.entitlementSlug === entitlementSlug,
    );
    if (isMetered) {
      throw new LicenseProblem(
        409,
        'DeleteLicenseEntitlement.MeteredByPrice',
        'an active price of this licence version meters this entitlement: deprecate the price before removing the grant',
      );
    }
  }

  private grantOf(slug: string, entitlementSlug: string) {
    return this.grants.find(
      (grant) =>
        grant.licenseSlug === slug && grant.entitlementSlug === entitlementSlug,
    );
  }

  /** Whether the version still grants something: a version that does is not deleted. */
  hasGrants(slug: string): boolean {
    return this.grants.some((grant) => grant.licenseSlug === slug);
  }

  /** What a deleted version takes with it: its prices, which cascade with it. */
  forgetVersion(slug: string) {
    this.prices.delete(slug);
    this.billed.delete(slug);
  }

  // --- What a version bills -------------------------------------------------

  private pricesOf(slug: string): PriceRecord[] {
    let prices = this.prices.get(slug);
    if (!prices) {
      prices = [];
      this.prices.set(slug, prices);
    }

    return prices;
  }

  /** `GET /licenses/{slug}/prices`: in display order, then by id. */
  listPrices(
    slug: string,
    filter: {
      billingModel?: Price['billingModel'];
      status?: Price['status'];
    } = {},
  ): Price[] {
    this.host.findLicense(slug);

    return clone(
      this.pricesOf(slug)
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

  private findPrice(operation: string, slug: string, id: string): PriceRecord {
    const price = this.pricesOf(slug).find((candidate) => candidate.id === id);
    if (!price) {
      throw new LicenseProblem(
        404,
        `${operation}.NotFound`,
        `price ${id} not found on license "${slug}"`,
      );
    }

    return price;
  }

  getPrice(slug: string, id: string): Price {
    this.host.findLicense(slug);

    return clone(this.findPrice('GetLicensePrice', slug, id));
  }

  private checkWrite(
    operation: string,
    slug: string,
    draft: PriceDraft,
    exceptPriceId: string | undefined,
  ): { factor: string | undefined; entitlement: Entitlement | undefined } {
    let entitlement: Entitlement | undefined;
    let factor: string | undefined;
    if (isMetered(draft.billingModel)) {
      entitlement = this.catalogueOf(draft.meteredEntitlementSlug);
      if (!entitlement) {
        throw new LicenseProblem(
          404,
          `${operation}.EntitlementNotFound`,
          `entitlement "${draft.meteredEntitlementSlug}" not found`,
        );
      }
      const others = this.pricesOf(slug).filter(
        (price) =>
          price.id !== exceptPriceId &&
          price.status === 'ACTIVE' &&
          price.metered?.entitlementSlug === draft.meteredEntitlementSlug,
      ).length;
      checkMeters(
        operation,
        draft,
        entitlement,
        this.grantOf(slug, draft.meteredEntitlementSlug),
        others,
      );
      factor = String(entitlement.saleUnitFactor ?? 1);
    }
    const siblings = this.pricesOf(slug).filter(
      (price) => price.id !== exceptPriceId,
    );
    if (siblings.some((price) => price.currency !== draft.currency)) {
      throw new LicenseProblem(
        422,
        `${operation}.CurrencyMismatch`,
        'this licence version already has prices in another currency: one currency per version',
      );
    }
    if (
      draft.isDefault &&
      siblings.some(
        (price) =>
          price.isDefault &&
          price.status === 'ACTIVE' &&
          price.billingPeriod === draft.billingPeriod,
      )
    ) {
      throw new LicenseProblem(
        409,
        `${operation}.DefaultConflict`,
        'another price is already the default for this billing period',
      );
    }

    return { entitlement, factor };
  }

  private toPrice(
    id: string,
    draft: PriceDraft,
    entitlement: Entitlement | undefined,
    factor: string | undefined,
    timestamps: { createdAt: string; updatedAt: string },
  ): PriceRecord {
    const amount = formatDecimal(parseDecimal(draft.unitAmountDecimal));
    const integral = /^\d+$/.test(amount) && amount.length < 18;

    return {
      billingModel: draft.billingModel,
      billingPeriod: draft.billingPeriod ?? null,
      billingTiming: draft.billingTiming,
      createdAt: timestamps.createdAt,
      currency: draft.currency,
      deprecatedAt: null,
      // The API stores what it is given: a label cleared by an update comes
      // back as the empty string, and only an omitted one is null.
      displayLabel: draft.displayLabel ?? null,
      displayOrder: draft.displayOrder,
      id,
      isDefault: draft.isDefault,
      metered:
        entitlement && factor
          ? {
              entitlementSlug: slugOf(entitlement),
              saleUnitFactor: factor,
              saleUnitPlural: entitlement.saleUnitPlural,
              saleUnitSingular: entitlement.saleUnitSingular,
            }
          : NULL_OBJECT,
      status: 'ACTIVE',
      unitAmount: integral ? Number(amount) : null,
      unitAmountDecimal: amount,
      updatedAt: timestamps.updatedAt,
    };
  }

  /** `POST /licenses/{slug}/prices`. */
  createPrice(slug: string, body: NewLicensePrice): Price {
    const operation = 'CreateLicensePrice';
    this.consume('createPrice');
    const draft: PriceDraft = {
      billingModel: body.billingModel,
      billingPeriod: body.billingPeriod,
      billingTiming:
        body.billingTiming ??
        (isMetered(body.billingModel) ? 'ARREARS' : 'ADVANCE'),
      currency: body.currency,
      displayLabel: body.displayLabel,
      displayOrder: body.displayOrder ?? 0,
      isDefault: body.isDefault ?? false,
      meteredEntitlementSlug: body.meteredEntitlementSlug ?? '',
      unitAmountDecimal: body.unitAmountDecimal,
    };
    checkShape(operation, draft);
    const license = this.host.findLicense(slug);
    if (license.lifecycleState === 'ARCHIVED') {
      throw new LicenseProblem(
        409,
        `${operation}.VersionArchived`,
        'an archived licence version takes no new price',
      );
    }
    this.refuseBilled(operation, slug);
    const { entitlement, factor } = this.checkWrite(
      operation,
      slug,
      draft,
      undefined,
    );
    const timestamp = this.host.nextTimestamp();
    const id = `price-${String(this.sequence).padStart(4, '0')}`;
    this.sequence += 1;
    const price = parseContract(
      zPrice,
      this.toPrice(id, draft, entitlement, factor, {
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      'LicensePricing.createPrice result',
    );
    this.pricesOf(slug).push(price);

    return clone(price);
  }

  /** `PATCH /licenses/{slug}/prices/{id}`: only the prices of a DRAFT version change. */
  updatePrice(slug: string, id: string, patch: LicensePriceChanges): Price {
    const operation = 'UpdateLicensePrice';
    this.consume('updatePrice');
    const license = this.host.findLicense(slug);
    const stored = this.findPrice(operation, slug, id);
    if (license.lifecycleState !== 'DRAFT') {
      throw new LicenseProblem(
        409,
        `${operation}.VersionNotDraft`,
        'the prices of a published or archived version are immutable: deprecate this one, or price a new version',
      );
    }
    const draft: PriceDraft = {
      billingModel: stored.billingModel,
      billingPeriod: patch.billingPeriod ?? stored.billingPeriod,
      billingTiming: patch.billingTiming ?? stored.billingTiming,
      currency: stored.currency,
      displayLabel: patch.displayLabel ?? stored.displayLabel ?? undefined,
      displayOrder: patch.displayOrder ?? stored.displayOrder,
      isDefault: patch.isDefault ?? stored.isDefault,
      meteredEntitlementSlug:
        patch.meteredEntitlementSlug ?? stored.metered?.entitlementSlug ?? '',
      unitAmountDecimal: patch.unitAmountDecimal ?? stored.unitAmountDecimal,
    };
    checkShape(operation, draft);
    const { entitlement, factor } = this.checkWrite(operation, slug, draft, id);
    // The factor is captured once: re-pointing the price at another
    // entitlement captures that one's, keeping it otherwise.
    const kept =
      stored.metered?.entitlementSlug === draft.meteredEntitlementSlug
        ? stored.metered.saleUnitFactor
        : factor;
    const updated = this.toPrice(id, draft, entitlement, kept, {
      createdAt: stored.createdAt,
      updatedAt: this.host.nextTimestamp(),
    });
    Object.assign(
      stored,
      parseContract(zPrice, updated, 'LicensePricing.updatePrice result'),
    );

    return clone(stored);
  }

  /** `POST /licenses/{slug}/prices/{id}/deprecate`: retires the price and its default flag. */
  deprecatePrice(slug: string, id: string): Price {
    const operation = 'DeprecateLicensePrice';
    this.consume('deprecatePrice');
    this.host.findLicense(slug);
    const stored = this.findPrice(operation, slug, id);
    if (stored.status === 'DEPRECATED') {
      throw new LicenseProblem(
        409,
        `${operation}.AlreadyDeprecated`,
        'this price is already deprecated',
      );
    }
    const timestamp = this.host.nextTimestamp();
    stored.status = 'DEPRECATED';
    stored.isDefault = false;
    stored.deprecatedAt = timestamp;
    stored.updatedAt = timestamp;

    return clone(stored);
  }

  /** `POST /licenses/{slug}/invoice-preview`. */
  previewInvoice(
    slug: string,
    scenario: Parameters<typeof composeLicenseInvoicePreview>[0]['scenario'],
  ) {
    this.consume('previewInvoice');
    const license = this.host.findLicense(slug);

    return composeLicenseInvoicePreview({
      entitlements: this.host.entitlements(),
      grants: this.grants.filter((grant) => grant.licenseSlug === slug),
      license: { name: license.name, slug },
      now: this.host.now(),
      prices: this.pricesOf(slug),
      scenario,
    });
  }
}
