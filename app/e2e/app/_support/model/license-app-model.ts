import { z } from 'zod';
import type {
  Entitlement,
  License,
  LicenseFamilyView,
  LicenseWritable,
} from '@/api-client';
import { zEntitlement, zLicense } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';
import { listLicenseFamilyViews } from './license-families';

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

/**
 * A refusal the Core API answers with a problem document. The handlers render
 * it as application/problem+json with its code and detail, so the console
 * shows the reason the real API would give.
 */
export class LicenseProblem extends Error {
  readonly httpStatus: number;
  readonly code: string;

  constructor(httpStatus: number, code: string, detail: string) {
    super(detail);
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

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

export type LicenseAppModelSeed = {
  /** The entitlement catalogue the detail page and the version form read. */
  entitlements?: Entitlement[];
  licenses?: License[];
};

export type SerializedLicenseAppModel = Required<LicenseAppModelSeed> & {
  clock: number;
  pendingErrors: Array<[LicenseErrorOp, number]>;
  sequence: number;
};

/**
 * The license catalogue as the Core API keeps it: versions grouped by
 * familyId, numbered per family, and moved between lifecycle states only
 * through publish, archive and unarchive -- with the same refusals.
 */
export class LicenseAppModel {
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private entitlements: Entitlement[];
  private licenses: LicenseRecord[];
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
    return model;
  }

  serializeForMsw(): SerializedLicenseAppModel {
    return {
      clock: this.clock,
      entitlements: clone(this.entitlements),
      licenses: clone(this.licenses),
      pendingErrors: this.errors.snapshot(),
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
      seed.licenses ?? [],
      'LicenseAppModel seed.licenses',
    );
    this.sequence = this.licenses.length + 1;

    const timestamps = this.licenses.flatMap((license) => [
      Date.parse(license.createdAt),
      Date.parse(license.updatedAt),
    ]);
    if (timestamps.length > 0) {
      this.clock = Math.max(this.clock, ...timestamps);
    }
  }

  /** Arm the next call to `op` to fail with the given HTTP status. One-shot. */
  setNextError(op: LicenseErrorOp, status: number) {
    this.errors.setNextError(op, status);
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
        slug,
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
    });
    return clone(license);
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
