import { z } from 'zod';
import type {
  Entitlement,
  License,
  LicenseEntitlement,
  LicenseEntitlementWritable,
  LicenseFamilyView,
  LicensePriceChanges,
  LicenseWritable,
  NewLicensePrice,
  Price,
  InvoicePreviewScenario,
} from '@/api-client';
import { zEntitlement, zLicense } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';
import { listLicenseFamilyViews } from './license-families';
import {
  type ArmedProblem,
  LicensePricing,
  type PricingProblemOperation,
  type PricingSeed,
  type SerializedPricing,
} from './license-pricing';
import { LicenseProblem } from './license-problem';
export { LicenseProblem } from './license-problem';

export type LicenseTransition = 'publish' | 'archive' | 'unarchive';
type LicenseErrorOp = 'create' | 'update' | LicenseTransition;
type LifecycleState = NonNullable<License['lifecycleState']>;
// The generated read type marks server-owned fields readonly; the model is the
// server here, so it keeps its rows writable.
type LicenseRecord = { -readonly [K in keyof License]: License[K] };

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// The one state each transition leaves, and how the API words a version in
// another one (kaiten api/internal/modules/licenses/*license/handler.go).
const TRANSITIONS: Record<
  LicenseTransition,
  {
    code: string;
    from: LifecycleState;
    to: LifecycleState;
    wrongState: (slug: string, current: LifecycleState) => string;
  }
> = {
  publish: {
    code: 'PublishLicense.NotADraft',
    from: 'DRAFT',
    to: 'PUBLISHED',
    wrongState: (slug, current) =>
      current === 'ARCHIVED'
        ? `License "${slug}" is archived; unarchive it to put it back on sale`
        : `License "${slug}" is already published`,
  },
  archive: {
    code: 'ArchiveLicense.NotPublished',
    from: 'PUBLISHED',
    to: 'ARCHIVED',
    wrongState: (slug, current) =>
      current === 'DRAFT'
        ? `License "${slug}" is a draft and was never on sale; delete it instead`
        : `License "${slug}" is already archived`,
  },
  unarchive: {
    code: 'UnarchiveLicense.NotArchived',
    from: 'ARCHIVED',
    to: 'PUBLISHED',
    wrongState: (slug, current) =>
      current === 'DRAFT'
        ? `License "${slug}" is a draft; publish it instead`
        : `License "${slug}" is not archived`,
  },
};

export type LicenseAppModelSeed = PricingSeed & {
  /** The entitlement catalogue the detail page and the version form read. */
  entitlements?: Entitlement[];
  licenses?: License[];
};

export type SerializedLicenseAppModel = {
  clock: number;
  entitlements: Entitlement[];
  licenses: License[];
  pendingErrors: Array<[LicenseErrorOp, number]>;
  pricing: SerializedPricing;
  sequence: number;
};

// Every version carries the commercial fields in a response, as the API
// writes them; a seed that leaves them out reads as the API's defaults.
const withCommercialDefaults = (license: License): License => ({
  ...license,
  pricingType: license.pricingType ?? 'CUSTOM',
  requiresPaymentMethod: license.requiresPaymentMethod ?? false,
});

const SELF_SERVE_CTA_URL = /^https?:\/\/\S+$/;
const MAX_SELF_SERVE_CTA_URL = 2048;

// The commercial fields are validated as the API does: a trial is at
// least one day, the CTA an http(s) URL of at most 2048 characters.
function checkCommercialFields(
  operation: 'CreateLicense' | 'UpdateLicense',
  body: Pick<LicenseWritable, 'selfServeCtaUrl' | 'trialPeriodDays'>,
) {
  const trial = body.trialPeriodDays;
  if (
    trial !== undefined &&
    (trial < 0 || (operation === 'CreateLicense' && trial < 1))
  ) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidTrialPeriodDays`,
      'trialPeriodDays must be at least 1',
    );
  }
  const url = body.selfServeCtaUrl;
  if (
    url !== undefined &&
    url !== '' &&
    (!SELF_SERVE_CTA_URL.test(url) || url.length > MAX_SELF_SERVE_CTA_URL)
  ) {
    throw new LicenseProblem(
      422,
      `${operation}.InvalidSelfServeCtaUrl`,
      'selfServeCtaUrl must be an http(s) URL of at most 2048 characters',
    );
  }
}

/**
 * The license catalogue as the Core API keeps it: versions grouped by
 * familyId, numbered per family, and moved between lifecycle states only
 * through publish, archive and unarchive -- with the same refusals. What a
 * version sells (its grants and its prices) is kept with it, and refused as the
 * API refuses: a billed version is frozen, and the prices of a published
 * version are immutable.
 */
export class LicenseAppModel {
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private entitlements: Entitlement[];
  private licenses: LicenseRecord[];
  private pricing: LicensePricing;
  private sequence: number;
  private readonly errors = new ErrorInjector<LicenseErrorOp>();

  static fromSerialized(state: SerializedLicenseAppModel) {
    const model = new LicenseAppModel({
      entitlements: state.entitlements,
      licenses: state.licenses,
    });
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);
    model.pricing = LicensePricing.fromSerialized(
      model.pricingHost(),
      state.pricing,
    );
    return model;
  }

  serializeForMsw(): SerializedLicenseAppModel {
    return {
      clock: this.clock,
      entitlements: clone(this.entitlements),
      licenses: clone(this.licenses),
      pendingErrors: this.errors.snapshot(),
      pricing: this.pricing.serialize(),
      sequence: this.sequence,
    };
  }

  constructor(seed: LicenseAppModelSeed = {}) {
    this.entitlements = parseContract(
      z.array(zEntitlement),
      seed.entitlements ?? [],
      'LicenseAppModel seed.entitlements',
    );
    this.licenses = parseContract(
      z.array(zLicense),
      (seed.licenses ?? []).map(withCommercialDefaults),
      'LicenseAppModel seed.licenses',
    );
    this.sequence = this.licenses.length + 1;
    this.pricing = new LicensePricing(this.pricingHost(), {
      billedVersions: seed.billedVersions,
      grants: seed.grants,
      prices: seed.prices,
    });

    const timestamps = this.licenses.flatMap((license) => [
      Date.parse(license.createdAt),
      Date.parse(license.updatedAt),
    ]);
    if (timestamps.length > 0) {
      this.clock = Math.max(this.clock, ...timestamps);
    }
  }

  private pricingHost() {
    return {
      entitlements: () => this.entitlements,
      findLicense: (slug: string) => this.find(slug),
      nextTimestamp: () => this.nextTimestamp(),
      now: () => new Date(this.clock),
    };
  }

  /** Arm the next call to `op` to fail with the given HTTP status. One-shot. */
  setNextError(op: LicenseErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  /** Arm the next call of a pricing operation to fail with a problem document. One-shot. */
  setNextProblem(op: PricingProblemOperation, problem: ArmedProblem) {
    this.pricing.armProblem(op, problem);
  }

  /** Makes a version billed by a live subscription: its grants and prices are frozen. */
  markBilled(slug: string) {
    this.pricing.markBilled(slug);
  }

  // What a version sells: GET/POST/PUT/DELETE /licenses/{slug}/entitlements,
  // /prices and /invoice-preview.
  listGrants(slug: string): LicenseEntitlement[] {
    return this.pricing.listGrants(slug);
  }

  associateGrant(slug: string, body: LicenseEntitlementWritable) {
    this.pricing.associateGrant(slug, body);
  }

  updateGrant(
    slug: string,
    entitlementSlug: string,
    body: LicenseEntitlementWritable,
  ) {
    this.pricing.updateGrant(slug, entitlementSlug, body);
  }

  deleteGrant(slug: string, entitlementSlug: string) {
    this.pricing.deleteGrant(slug, entitlementSlug);
  }

  listPrices(
    slug: string,
    filter?: { billingModel?: Price['billingModel']; status?: Price['status'] },
  ): Price[] {
    return this.pricing.listPrices(slug, filter);
  }

  getPrice(slug: string, id: string): Price {
    return this.pricing.getPrice(slug, id);
  }

  createPrice(slug: string, body: NewLicensePrice): Price {
    return this.pricing.createPrice(slug, body);
  }

  updatePrice(slug: string, id: string, patch: LicensePriceChanges): Price {
    return this.pricing.updatePrice(slug, id, patch);
  }

  deprecatePrice(slug: string, id: string): Price {
    return this.pricing.deprecatePrice(slug, id);
  }

  previewInvoice(slug: string, scenario: InvoicePreviewScenario) {
    return this.pricing.previewInvoice(slug, scenario);
  }

  listLicenses(): License[] {
    return clone(this.licenses);
  }

  getLicense(slug: string): License {
    return clone(this.find(slug));
  }

  /** GET /license-families: each family and the version it resolves to. */
  listLicenseFamilies(): LicenseFamilyView[] {
    return listLicenseFamilyViews(this.licenses);
  }

  listEntitlements(): Entitlement[] {
    return clone(this.entitlements);
  }

  /**
   * Adds a version to the family body.familyId names, numbered after the
   * family's highest and slugged after the family, or opens a new family.
   */
  createLicense(body: LicenseWritable): License {
    this.errors.consume('create');

    const lifecycleState = body.lifecycleState ?? 'PUBLISHED';
    // Checked ahead of the other rules, as in the API's use case: a version is
    // only archived by withdrawing it from sale.
    if (lifecycleState === 'ARCHIVED') {
      throw new LicenseProblem(
        422,
        'CreateLicense.LifecycleStateNotSettable',
        'a license is created DRAFT or PUBLISHED; it becomes ARCHIVED through archive-license, which withdraws a published version from sale',
      );
    }
    checkCommercialFields('CreateLicense', body);
    const isDefault = body.isDefault ?? false;
    if (isDefault && lifecycleState !== 'PUBLISHED') {
      throw new LicenseProblem(
        409,
        'CreateLicense.DefaultMustBePublished',
        "a license can only be the family's default while it is PUBLISHED",
      );
    }

    const family = body.familyId ? this.versionsOf(body.familyId) : [];
    if (body.familyId && family.length === 0) {
      throw new LicenseProblem(
        404,
        'CreateLicense.FamilyNotFound',
        `License family with id ${body.familyId} not found`,
      );
    }

    const version =
      family.length === 0
        ? 1
        : Math.max(...family.map((license) => Number(license.version))) + 1;
    const familyId = body.familyId ?? `family-${this.sequence}`;
    const slug =
      family[0] === undefined
        ? (body.slug ?? `${slugify(body.name)}-${this.sequence}`)
        : `${family[0].slug}-v${version}`;

    if (isDefault) {
      this.clearDefault(familyId);
    }

    const timestamp = this.nextTimestamp();
    const license = parseContract(
      zLicense,
      {
        createdAt: timestamp,
        description: body.description,
        familyId,
        id: `license-${this.sequence}`,
        isDefault,
        lifecycleState,
        name: body.name,
        pricingType: body.pricingType ?? 'CUSTOM',
        requiresPaymentMethod: body.requiresPaymentMethod ?? false,
        selfServeCtaUrl: body.selfServeCtaUrl || undefined,
        slug,
        trialPeriodDays: body.trialPeriodDays,
        type: body.type,
        updatedAt: timestamp,
        version: String(version),
        versionName: body.versionName || `Version - ${version}`,
      },
      'LicenseAppModel.createLicense result',
    );

    this.sequence += 1;
    this.licenses.push(license);
    return clone(license);
  }

  /** PUT: the fields an update may change. The state is only echoed. */
  updateLicense(slug: string, body: LicenseWritable): License {
    this.errors.consume('update');
    const license = this.find(slug);

    if (
      body.lifecycleState !== undefined &&
      body.lifecycleState !== license.lifecycleState
    ) {
      throw new LicenseProblem(
        422,
        'UpdateLicense.LifecycleStateNotSettable',
        `License "${slug}" is ${license.lifecycleState}; its lifecycle state changes through POST /licenses/${slug}/publish, /archive or /unarchive`,
      );
    }
    if (body.isDefault && license.lifecycleState !== 'PUBLISHED') {
      throw new LicenseProblem(
        409,
        'UpdateLicense.DefaultMustBePublished',
        `License "${slug}" is not PUBLISHED, and only a published version can be its family's default; publish or unarchive it first`,
      );
    }
    checkCommercialFields('UpdateLicense', body);
    if (body.isDefault) {
      this.clearDefault(license.familyId, slug);
    }

    Object.assign(license, {
      description: body.description,
      isDefault: body.isDefault ?? false,
      name: body.name,
      type: body.type,
      updatedAt: this.nextTimestamp(),
      versionName: body.versionName ?? license.versionName,
      // The four commercial fields keep what is stored when the update leaves
      // them out, so an older client never resets them. A trial of 0 and an
      // empty URL clear their field: the API's way to empty one.
      pricingType: body.pricingType ?? license.pricingType,
      requiresPaymentMethod:
        body.requiresPaymentMethod ?? license.requiresPaymentMethod,
      selfServeCtaUrl:
        body.selfServeCtaUrl === undefined
          ? license.selfServeCtaUrl
          : body.selfServeCtaUrl || undefined,
      trialPeriodDays:
        body.trialPeriodDays === undefined
          ? license.trialPeriodDays
          : body.trialPeriodDays || undefined,
    });
    return clone(license);
  }

  /**
   * DELETE /licenses/{slug}. A version that still grants something is refused,
   * as the API refuses it: a grant restricts the deletion of its version. The
   * prices of the version go with it, and the last version of a family takes the
   * family away, which the families read from the versions.
   */
  deleteLicense(slug: string): void {
    const index = this.licenses.findIndex((license) => license.slug === slug);
    if (index < 0) {
      throw new LicenseProblem(
        404,
        'DeleteLicense.NotFound',
        `License with slug "${slug}" not found`,
      );
    }
    if (this.pricing.hasGrants(slug)) {
      throw new LicenseProblem(
        409,
        'DeleteLicense.InUseConflict',
        `License with slug "${slug}" is still referenced by an instance or an entitlement and cannot be deleted`,
      );
    }
    this.licenses.splice(index, 1);
    this.pricing.forgetVersion(slug);
  }

  /** POST /licenses/{slug}/publish, /archive or /unarchive. */
  transition(slug: string, op: LicenseTransition): License {
    this.errors.consume(op);
    const license = this.find(slug);
    const transition = TRANSITIONS[op];
    const current = license.lifecycleState ?? 'PUBLISHED';

    if (current !== transition.from) {
      throw new LicenseProblem(
        409,
        transition.code,
        transition.wrongState(slug, current),
      );
    }
    if (op === 'archive' && license.isDefault) {
      throw new LicenseProblem(
        409,
        'ArchiveLicense.DefaultMustBePublished',
        `License "${slug}" is its family's default, and a default must stay PUBLISHED; make another published version the default, or unset it, first`,
      );
    }

    license.lifecycleState = transition.to;
    license.updatedAt = this.nextTimestamp();
    return clone(license);
  }

  private find(slug: string): LicenseRecord {
    const license = this.licenses.find((candidate) => candidate.slug === slug);
    if (!license) {
      throw new Error(`License "${slug}" not found`);
    }
    return license;
  }

  /** The versions of a family, lowest version first. */
  private versionsOf(familyId: string): LicenseRecord[] {
    return this.licenses
      .filter((license) => license.familyId === familyId)
      .sort((left, right) => Number(left.version) - Number(right.version));
  }

  private clearDefault(familyId: string | undefined, keepSlug?: string) {
    for (const license of this.licenses) {
      if (
        license.familyId === familyId &&
        license.isDefault &&
        license.slug !== keepSlug
      ) {
        license.isDefault = false;
        license.updatedAt = this.nextTimestamp();
      }
    }
  }

  private nextTimestamp(): string {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
}
