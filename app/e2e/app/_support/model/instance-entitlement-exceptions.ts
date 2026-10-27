import { z } from 'zod';
import type {
  Entitlement,
  EntitlementException,
  EntitlementUsage,
  NewEntitlementException,
  Provenance,
} from '@/api-client';
import {
  zEntitlementException,
  zNewEntitlementException,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { BillingProblem } from './billing-problem';

type CatalogueEntry = Pick<Entitlement, 'id' | 'slug' | 'type'>;
export type ExceptionModelSeed = {
  rows?: EntitlementException[];
  catalogue?: CatalogueEntry[];
  sequence?: number;
};

const clone = <T>(value: T): T => structuredClone(value);
const typedValue = (
  type: EntitlementException['entitlementType'],
  value: Exclude<EntitlementException['value'], null>,
): NonNullable<EntitlementUsage['limit']> =>
  type === 'BOOLEAN'
    ? { type: 'boolean', value: value as boolean }
    : type === 'CONFIG'
      ? { type: 'object', value: value as Record<string, unknown> }
      : { type: 'number', value: value as number };

/** The dated exception layer, with the REST contract's status and vendor-only reason. */
export class InstanceEntitlementExceptions {
  private rows: EntitlementException[];
  private catalogue: CatalogueEntry[];
  private sequence: number;
  constructor(seed: ExceptionModelSeed = {}) {
    this.rows = parseContract(
      z.array(zEntitlementException),
      seed.rows ?? [],
      'exception seed',
    );
    this.catalogue = clone(seed.catalogue ?? []);
    this.sequence = seed.sequence ?? 1;
  }
  serialize(): ExceptionModelSeed {
    return clone({
      rows: this.rows,
      catalogue: this.catalogue,
      sequence: this.sequence,
    });
  }
  private status(
    row: EntitlementException,
    now: number,
  ): EntitlementException['status'] {
    return row.revokedAt
      ? 'REVOKED'
      : row.endsAt && Date.parse(row.endsAt) <= now
        ? 'EXPIRED'
        : Date.parse(row.startsAt) > now
          ? 'SCHEDULED'
          : 'ACTIVE';
  }
  list(
    instanceSlug: string,
    filter: 'active' | 'all',
    now: number,
  ): EntitlementException[] {
    return this.rows
      .filter((row) => row.instanceSlug === instanceSlug)
      .map((row) => ({ ...clone(row), status: this.status(row, now) }))
      .filter(
        (row) =>
          filter === 'all' ||
          row.status === 'ACTIVE' ||
          row.status === 'SCHEDULED',
      )
      .sort(
        (a, b) =>
          Date.parse(b.startsAt) - Date.parse(a.startsAt) ||
          a.id.localeCompare(b.id),
      );
  }
  create(
    instanceSlug: string,
    input: NewEntitlementException,
    now: number,
  ): EntitlementException {
    const body = zNewEntitlementException.parse(input);
    const entitlement = this.catalogue.find(
      (row) => row.slug === body.entitlementSlug,
    );
    const refuse = (code: string, status = 422) =>
      new BillingProblem(status, `CreateEntitlementException.${code}`, code);
    if (!entitlement?.type) throw refuse('EntitlementNotFound', 404);
    const numeric =
      entitlement.type === 'NUMBER' || entitlement.type === 'NUMBER_AI_CREDIT';
    if (!numeric && body.kind !== 'SET') throw refuse('InvalidKind');
    if (!body.reason.trim() || body.reason.trim().length > 500)
      throw refuse('ReasonRequired');
    const startsAt = body.startsAt ?? new Date(now).toISOString();
    const endsAt = body.endsAt ?? null;
    if (
      endsAt &&
      (Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) <= now)
    )
      throw refuse('InvalidWindow');
    if (
      body.kind === 'UNLIMITED'
        ? body.value != null
        : numeric
          ? typeof body.value !== 'number' ||
            (body.kind === 'ADD' ? body.value <= 0 : body.value < 0)
          : entitlement.type === 'BOOLEAN'
            ? typeof body.value !== 'boolean'
            : typeof body.value !== 'object' ||
              body.value === null ||
              Array.isArray(body.value)
    )
      throw refuse('InvalidValue');
    const overlapping = this.rows.find(
      (row) =>
        row.instanceSlug === instanceSlug &&
        row.entitlementSlug === body.entitlementSlug &&
        !row.revokedAt &&
        Date.parse(startsAt) <
          (row.endsAt ? Date.parse(row.endsAt) : Infinity) &&
        Date.parse(row.startsAt) < (endsAt ? Date.parse(endsAt) : Infinity),
    );
    if (overlapping)
      throw new BillingProblem(
        409,
        'CreateEntitlementException.Overlap',
        'Overlap',
        { errors: [{ value: { exceptionId: overlapping.id } }] },
      );
    const row = zEntitlementException.parse({
      id: `exception-${this.sequence++}`,
      instanceSlug,
      entitlementSlug: body.entitlementSlug,
      entitlementType: entitlement.type,
      kind: body.kind,
      value: body.value ?? null,
      reason: body.reason.trim(),
      startsAt,
      endsAt,
      status: Date.parse(startsAt) > now ? 'SCHEDULED' : 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      revokedAt: null,
    });
    this.rows.push(row);
    return clone(row);
  }
  revoke(instanceSlug: string, id: string, now: number) {
    const row = this.rows.find(
      (item) => item.id === id && item.instanceSlug === instanceSlug,
    );
    if (!row)
      throw new BillingProblem(
        404,
        'RevokeEntitlementException.NotFound',
        'NotFound',
      );
    if (['ACTIVE', 'SCHEDULED'].includes(this.status(row, now)))
      row.revokedAt = new Date(now).toISOString();
  }
  apply(
    instanceSlug: string,
    base: EntitlementUsage[],
    now: number,
    license: { licenseId: string; licenseSlug: string },
  ): EntitlementUsage[] {
    const rows = clone(base);
    for (const exception of this.list(instanceSlug, 'active', now).filter(
      (row) => row.status === 'ACTIVE',
    )) {
      let usage = rows.find(
        (row) => row.entitlementSlug === exception.entitlementSlug,
      );
      if (!usage) {
        const entitlement = this.catalogue.find(
          (row) => row.slug === exception.entitlementSlug,
        )!;
        const empty =
          exception.entitlementType === 'BOOLEAN'
            ? false
            : exception.entitlementType === 'CONFIG'
              ? {}
              : 0;
        usage = {
          ...license,
          entitlementId: entitlement.id,
          entitlementSlug: exception.entitlementSlug,
          source: 'exception',
          value: typedValue(exception.entitlementType, empty),
          limit: typedValue(exception.entitlementType, empty),
          provenance: {
            license: null,
            addons: [],
            boosts: [],
            exception: null,
            number: null,
          },
        };
        rows.push(usage);
      }
      const before = usage.limit?.type === 'number' ? usage.limit.value : 0;
      const effective =
        exception.kind === 'UNLIMITED'
          ? -1
          : exception.kind === 'ADD'
            ? before === -1
              ? -1
              : before + (exception.value as number)
            : exception.value!;
      const provenance: Provenance = usage.provenance ?? {
        license: null,
        addons: [],
        boosts: [],
        exception: null,
        number: null,
      };
      usage.limit = typedValue(exception.entitlementType, effective);
      if (
        exception.entitlementType === 'BOOLEAN' ||
        exception.entitlementType === 'CONFIG'
      )
        usage.value = clone(usage.limit);
      provenance.exception = {
        instanceEntitlementExceptionId: exception.id,
        kind: exception.kind,
        value:
          exception.kind === 'UNLIMITED'
            ? null
            : typedValue(exception.entitlementType, exception.value!),
        startsAt: exception.startsAt,
        endsAt: exception.endsAt,
      };
      if (
        exception.entitlementType === 'NUMBER' ||
        exception.entitlementType === 'NUMBER_AI_CREDIT'
      )
        provenance.number = {
          license:
            provenance.license?.value.type === 'number'
              ? provenance.license.value.value
              : null,
          afterAddons: before,
          boostSet: null,
          boostAdd: null,
          boostMultiply: null,
          ...provenance.number,
          afterBoosts: before,
          effective: effective as number,
          unlimited: effective === -1,
        };
      usage.provenance = provenance;
    }
    return rows;
  }
}
