import { z } from 'zod';
import type { Entitlement } from '@/api-client';
import { zEntitlement } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';

type EntitlementRecord = Entitlement;
type EntitlementErrorOp = 'create' | 'update' | 'delete';

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export type EntitlementAppModelSeed = {
  entitlements?: EntitlementRecord[];
};

export type SerializedEntitlementAppModel =
  Required<EntitlementAppModelSeed> & {
    clock: number;
    pendingErrors: Array<[EntitlementErrorOp, number]>;
    sequence: number;
  };

export class EntitlementAppModel {
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private entitlements: EntitlementRecord[];
  private sequence: number;
  private readonly errors = new ErrorInjector<EntitlementErrorOp>();

  static fromSerialized(state: SerializedEntitlementAppModel) {
    const model = new EntitlementAppModel({
      entitlements: state.entitlements,
    });
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);
    return model;
  }

  serializeForMsw(): SerializedEntitlementAppModel {
    return {
      clock: this.clock,
      entitlements: clone(this.entitlements),
      pendingErrors: this.errors.snapshot(),
      sequence: this.sequence,
    };
  }

  constructor(seed: EntitlementAppModelSeed = {}) {
    this.entitlements = parseContract(
      z.array(zEntitlement),
      seed.entitlements ?? [],
      'EntitlementAppModel seed.entitlements',
    );
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

    // Like the API, a slug sent by the caller is kept as it is and a taken one
    // is a conflict. Without one the slug comes from the name; the API also
    // appends random characters, which this deterministic model leaves out.
    if (body.slug && this.entitlements.some((e) => e.slug === body.slug)) {
      throw Object.assign(
        new Error(
          `Entitlement with slug "${body.slug}" already exists in this organization`,
        ),
        { httpStatus: 409 },
      );
    }

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
      throw new Error(
        'UpdateEntitlement.ImmutableResetPeriod: resetPeriod is immutable once configured and cannot be changed or removed',
      );
    }
    if (current.resetAnchor && body.resetAnchor !== current.resetAnchor) {
      throw new Error(
        'UpdateEntitlement.ImmutableResetAnchor: resetAnchor is immutable once configured and cannot be changed or removed',
      );
    }

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
