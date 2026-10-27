import { z } from 'zod';
import type { Entitlement } from '@/api-client';
import { zEntitlement } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { BillingProblem } from './billing-problem';
import { ErrorInjector } from './error-injector';
import type { ArmedProblem } from './license-pricing';

type EntitlementRecord = Entitlement;
type EntitlementErrorOp = 'create' | 'update' | 'delete';
/** What the model arms to fail with a problem document: the writes that carry fields. */
type EntitlementProblemOp = 'create' | 'update';

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * What still references an entitlement, which keeps it from being deleted: the
 * grants of the licenses and of the add-ons, the voucher boosts, and the prices
 * that meter it. The
 * API counts what the release has; a count it does not carry is left out.
 */
export type EntitlementReferences = Partial<
  Record<
    | 'addonGrants'
    | 'addonPrices'
    | 'boostGrants'
    | 'licenseGrants'
    | 'licensePrices',
    number
  >
>;

export type EntitlementAppModelSeed = {
  entitlements?: EntitlementRecord[];
  /** The entitlements that are still referenced, by slug: deleting one is refused. */
  references?: Record<string, EntitlementReferences>;
};

export type SerializedEntitlementAppModel =
  Required<EntitlementAppModelSeed> & {
    armedProblems?: Array<[EntitlementProblemOp, ArmedProblem]>;
    clock: number;
    pendingErrors: Array<[EntitlementErrorOp, number]>;
    sequence: number;
  };

const isNumberFamily = (type: EntitlementRecord['type'] | undefined) =>
  type === 'NUMBER' || type === 'NUMBER_AI_CREDIT';

/**
 * The early-warning threshold the API stores for an entitlement written from `body`:
 * a numeric one sent without it has 0 (the warning is off), never the value it had
 * before, and every other type reads 0 too, as the API always returns the field.
 */
function warningThresholdOf(
  body: Pick<Partial<EntitlementRecord>, 'type' | 'warningThresholdPercent'>,
): number {
  return isNumberFamily(body.type) ? (body.warningThresholdPercent ?? 0) : 0;
}

/**
 * The refusal of a threshold on a type that has none, as the API words it: a 422 on
 * a write that carries a threshold for a boolean or a config entitlement, 0 included.
 * `type` is the type the entitlement has (the stored one on an update).
 */
function refuseThresholdOnNonNumeric(
  operation: 'CreateEntitlement' | 'UpdateEntitlement',
  type: EntitlementRecord['type'] | undefined,
  body: Pick<Partial<EntitlementRecord>, 'warningThresholdPercent'>,
) {
  if (body.warningThresholdPercent != null && !isNumberFamily(type)) {
    throw new BillingProblem(
      422,
      `${operation}.InvalidEnforcementPolicyConfiguration`,
      'warningThresholdPercent is only allowed when type is NUMBER or NUMBER_AI_CREDIT',
    );
  }
}

/**
 * The refusal of the billing date on a cadence it cannot follow, as the API
 * words it: a 422 on the anchor, the same for a create and for the update of an
 * entitlement that adopts a reset.
 */
function refuseBillingPeriodCadence(
  operation: 'CreateEntitlement' | 'UpdateEntitlement',
  body: Pick<Partial<EntitlementRecord>, 'resetAnchor' | 'resetPeriod'>,
) {
  if (
    body.resetAnchor === 'BILLING_PERIOD' &&
    body.resetPeriod !== 'MONTH' &&
    body.resetPeriod !== 'YEAR'
  ) {
    throw new BillingProblem(
      422,
      `${operation}.InvalidResetAnchor`,
      'resetAnchor BILLING_PERIOD takes resetPeriod MONTH or YEAR',
    );
  }
}

export class EntitlementAppModel {
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private entitlements: EntitlementRecord[];
  private references: Record<string, EntitlementReferences>;
  private sequence: number;
  private readonly armed = new Map<EntitlementProblemOp, ArmedProblem>();
  private readonly errors = new ErrorInjector<EntitlementErrorOp>();

  static fromSerialized(state: SerializedEntitlementAppModel) {
    const model = new EntitlementAppModel({
      entitlements: state.entitlements,
      references: state.references,
    });
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);
    for (const [operation, problem] of state.armedProblems ?? []) {
      model.armed.set(operation, problem);
    }
    return model;
  }

  serializeForMsw(): SerializedEntitlementAppModel {
    return {
      armedProblems: [...this.armed.entries()],
      clock: this.clock,
      entitlements: clone(this.entitlements),
      pendingErrors: this.errors.snapshot(),
      references: clone(this.references),
      sequence: this.sequence,
    };
  }

  constructor(seed: EntitlementAppModelSeed = {}) {
    this.references = clone(seed.references ?? {});
    // The API always returns the threshold, 0 when none is set, for every type.
    this.entitlements = parseContract(
      z.array(zEntitlement),
      seed.entitlements ?? [],
      'EntitlementAppModel seed.entitlements',
    ).map((entitlement) => ({
      ...entitlement,
      warningThresholdPercent: entitlement.warningThresholdPercent ?? 0,
    }));
    this.sequence = this.entitlements.length + 1;

    const timestamps = this.entitlements.flatMap((entitlement) => [
      Date.parse(entitlement.createdAt),
      Date.parse(entitlement.updatedAt),
    ]);
    const latestTimestamp =
      timestamps.length > 0 ? Math.max(...timestamps) : null;

    if (latestTimestamp != null && Number.isFinite(latestTimestamp)) {
      this.clock = latestTimestamp;
    }
  }

  /**
   * Arm the next call to `op` to fail with the given HTTP status. One-shot.
   */
  setNextError(op: EntitlementErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  /** Arm the next write to fail with a problem document: its code, its detail and its status. One-shot. */
  setNextProblem(op: EntitlementProblemOp, problem: ArmedProblem) {
    this.armed.set(op, problem);
  }

  private consumeProblem(op: EntitlementProblemOp) {
    const problem = this.armed.get(op);
    if (problem) {
      this.armed.delete(op);
      throw new BillingProblem(problem.status, problem.code, problem.detail);
    }
  }

  /** @deprecated Use `setNextError('create', status)` instead. */
  setNextCreateError(status: number) {
    this.setNextError('create', status);
  }

  listEntitlements(): EntitlementRecord[] {
    return clone(this.entitlements);
  }

  getEntitlement(slug: string): EntitlementRecord {
    return clone(this.findEntitlement(slug));
  }

  createEntitlement(body: Partial<EntitlementRecord>): EntitlementRecord {
    this.errors.consume('create');
    this.consumeProblem('create');

    // Like the API, a slug sent by the caller is kept as it is and a taken one
    // is a conflict. Without one the slug comes from the name; the API also
    // appends random characters, which this deterministic model leaves out.
    if (body.slug && this.entitlements.some((e) => e.slug === body.slug)) {
      throw new BillingProblem(
        409,
        'CreateEntitlement.SlugConflict',
        `Entitlement with slug "${body.slug}" already exists in this organization`,
      );
    }

    refuseBillingPeriodCadence('CreateEntitlement', body);
    refuseThresholdOnNonNumeric(
      'CreateEntitlement',
      body.type ?? 'NUMBER',
      body,
    );

    const timestamp = this.nextTimestamp();
    const entitlement: EntitlementRecord = {
      aggregationMethod: body.aggregationMethod ?? 'COUNT',
      createdAt: timestamp,
      description: body.description ?? null,
      icon: body.icon ?? undefined,
      id: `entitlement-${this.sequence}`,
      name: body.name ?? `Entitlement ${this.sequence}`,
      slug: body.slug || slugify(body.name ?? `entitlement-${this.sequence}`),
      type: body.type ?? 'NUMBER',
      updatedAt: timestamp,
      userFacing: body.userFacing ?? false,
      displayOrder: body.displayOrder ?? 0,
      unitSingular: body.unitSingular ?? undefined,
      unitPlural: body.unitPlural ?? undefined,
      saleUnitSingular: body.saleUnitSingular ?? undefined,
      saleUnitPlural: body.saleUnitPlural ?? undefined,
      saleUnitFactor: body.saleUnitFactor ?? undefined,
      resetPeriod: body.resetPeriod ?? undefined,
      resetAnchor: body.resetAnchor ?? undefined,
      warningThresholdPercent: warningThresholdOf(body),
    };
    const result = parseContract(
      zEntitlement,
      entitlement,
      'EntitlementAppModel.createEntitlement result',
    );

    this.sequence += 1;
    this.entitlements.unshift(result);

    return clone(result);
  }

  updateEntitlement(
    slug: string,
    body: Partial<EntitlementRecord>,
  ): EntitlementRecord {
    this.errors.consume('update');
    this.consumeProblem('update');
    const index = this.entitlements.findIndex((e) => e.slug === slug);

    if (index < 0) {
      throw new Error(`Entitlement "${slug}" not found`);
    }

    const current = this.entitlements[index];

    // Like the API, an entitlement is never renamed: a PUT leaves the slug out
    // or echoes the current one. Modelled here so the e2e suite catches a form
    // that sends the slug of an edit.
    if (body.slug && body.slug !== slug) {
      throw Object.assign(
        new Error(
          'UpdateEntitlement.SlugNotRenameable: slug cannot be changed through this endpoint; omit it or send the current slug',
        ),
        { httpStatus: 422 },
      );
    }

    // One-way door, like the API: once a cadence is stored, a full-replace PUT
    // must echo the exact same pair back. Omitting it is an attempted removal,
    // not a reset to null. Modelled here so the e2e suite actually catches a
    // partial-edit path that forgets to carry the pair.
    if (current.resetPeriod && body.resetPeriod !== current.resetPeriod) {
      throw new BillingProblem(
        400,
        'UpdateEntitlement.ImmutableResetPeriod',
        'resetPeriod is immutable once configured and cannot be changed or removed',
      );
    }
    if (current.resetAnchor && body.resetAnchor !== current.resetAnchor) {
      throw new BillingProblem(
        400,
        'UpdateEntitlement.ImmutableResetAnchor',
        'resetAnchor is immutable once configured and cannot be changed or removed',
      );
    }
    refuseBillingPeriodCadence('UpdateEntitlement', body);
    refuseThresholdOnNonNumeric('UpdateEntitlement', current.type, body);

    const updated: EntitlementRecord = {
      ...current,
      ...body,
      createdAt: this.entitlements[index].createdAt,
      id: this.entitlements[index].id,
      slug: this.entitlements[index].slug ?? slug,
      updatedAt: this.nextTimestamp(),
      // PUT replaces these fields wholesale; absent means cleared, like the API.
      description: body.description ?? null,
      icon: body.icon ?? undefined,
      userFacing: body.userFacing ?? false,
      displayOrder: body.displayOrder ?? 0,
      unitSingular: body.unitSingular ?? undefined,
      unitPlural: body.unitPlural ?? undefined,
      saleUnitSingular: body.saleUnitSingular ?? undefined,
      saleUnitPlural: body.saleUnitPlural ?? undefined,
      saleUnitFactor: body.saleUnitFactor ?? undefined,
      resetPeriod: body.resetPeriod ?? undefined,
      resetAnchor: body.resetAnchor ?? undefined,
      // Replaced like the rest: a PUT without the threshold of a numeric entitlement
      // turns the warning off, as the API stores it (0), instead of keeping the old one.
      warningThresholdPercent: warningThresholdOf({
        ...body,
        type: current.type,
      }),
    };
    const result = parseContract(
      zEntitlement,
      updated,
      'EntitlementAppModel.updateEntitlement result',
    );

    this.entitlements[index] = result;

    return clone(result);
  }

  deleteEntitlement(slug: string) {
    this.errors.consume('delete');
    const index = this.entitlements.findIndex((e) => e.slug === slug);

    if (index < 0) {
      throw new Error(`Entitlement "${slug}" not found`);
    }

    const references = this.references[slug];
    if (references && Object.values(references).some((count) => count > 0)) {
      throw new BillingProblem(
        409,
        'DeleteEntitlement.InUseConflict',
        `Entitlement "${slug}" is still in use and cannot be deleted`,
        {
          errors: [
            {
              location: 'entitlement',
              message: 'what still references the entitlement',
              value: references,
            },
          ],
        },
      );
    }

    this.entitlements.splice(index, 1);
  }

  private nextTimestamp() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }

  private findEntitlement(slug: string): EntitlementRecord {
    const entitlement = this.entitlements.find((e) => e.slug === slug);

    if (!entitlement) {
      throw new Error(`Entitlement "${slug}" not found`);
    }

    return entitlement;
  }
}
