import type {
  Entitlement,
  EntitlementResource,
  EntitlementUsage,
  PageEntitlementResource,
  ReportedEntitlementUsage,
  ReportEntitlementResourceUsageMetricData,
  UsageReport,
} from '@/api-client';
import { zPageEntitlementResource } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { BillingProblem } from './billing-problem';
import type { InstanceUsageHistory } from './instance-usage-history';
import { stableUuid } from './stable-uuid';

/**
 * The entitlements that count per resource (`limitScope` RESOURCE), as the Core API serves
 * them (api/internal/modules/instances: reportentitlementusagemetric, listentitlementresources,
 * deleteentitlementresource, getentitlementresourceusage): one counter for each resource of
 * an instance, each folded, gated and windowed as an entitlement's own counter, all measured
 * against the one limit the instance has for the entitlement.
 *
 * What the model computes, as the API does, and never holds as a fixed row: the entitlement's
 * own `value` (its highest counter in the current window), its `resources` block (how many
 * resources hold a counter, how many are at the limit), the 404s and 422s of the four routes,
 * the ceiling of resources, the idempotency of a report per resource, and the journal row a
 * report leaves (with the pair's report number, which resources share).
 *
 * The current window of a pair is the one its usage says (`currentPeriodStart`): the mocks
 * have no clock to phase a cadence by, and a counter whose window is another reads zero, as
 * a counter of a closed window does.
 */

/** What the API allows a resource key: 1 to 128 characters, and neither `.` nor `..`. */
const RESOURCE_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const IDEMPOTENCY_KEY = RESOURCE_KEY;
const KEY_LOCATION = 'path.resourceKey';

/** The ceiling of resources an entitlement may count on an instance: `KAITEN_USAGE_MAX_RESOURCES`. */
export const DEFAULT_MAX_RESOURCES = 10_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export const isResourceKey = (key: string) =>
  key !== '.' && key !== '..' && RESOURCE_KEY.test(key);

type AggregationMethod = NonNullable<Entitlement['aggregationMethod']>;
type Behavior = 'append' | 'set';

type Counter = { eventCount: number; value: number };
const ZERO: Counter = { eventCount: 0, value: 0 };

/** A counter as the pair keeps it. `periodStart` left out means "the window the pair is in". */
export type ResourceCounter = Counter & {
  periodStart?: string | null;
  resourceKey: string;
};

/** What a seed gives of a counter: the report count defaults to one. */
export type ResourceCounterSeed = Omit<ResourceCounter, 'eventCount'> & {
  eventCount?: number;
};

export type InstanceEntitlementResourcesSeed = {
  /** The ceiling of resources an entitlement may count on an instance; the API's is 10 000. */
  maxResources?: number;
  /**
   * The entitlements that count per resource, by slug, and how each folds an `append`
   * report: the entitlement's aggregation method (SUM when it is left out).
   */
  perResource?: Record<string, { aggregationMethod?: AggregationMethod }>;
  /** The counters each instance holds, by instance slug and then entitlement slug. */
  resources?: Record<string, Record<string, ResourceCounterSeed[]>>;
};

export type ResourceOperation =
  | 'deleteEntitlementResource'
  | 'getEntitlementResourceUsageMetrics'
  | 'listEntitlementResources'
  | 'reportEntitlementResourceUsageMetric';

export type SerializedInstanceEntitlementResources = {
  armedProblems: Array<[ResourceOperation, ArmedBillingProblem]>;
  counters: Record<string, Record<string, ResourceCounter[]>>;
  maxResources: number;
  perResource: Record<string, { aggregationMethod: AggregationMethod }>;
};

/** A pair the instances know: its usage as it is served, which is absent once nothing grants the entitlement. */
type KnownPair = {
  found: 'ok';
  usage: EntitlementUsage | undefined;
};

/** What the model of the instances says of a pair: what it is, or which of its two ends is not known. */
export type PairLookup = { found: 'instance' | 'entitlement' } | KnownPair;

/** What the resources need of the instances: where a pair stands, and the journal a report is written to. */
export type ResourceHost = {
  journal(): InstanceUsageHistory;
  lookup(instanceSlug: string, entitlementSlug: string): PairLookup;
};

type ReportBody = ReportEntitlementResourceUsageMetricData['body'];

/** How a report was sent, as far as the header says: `sent` tells an absent key from an empty one. */
export type IdempotencyHeader = { key?: string; sent: boolean };

export type ReportOutcome = {
  body: ReportedEntitlementUsage;
  /** True when the key had been accepted already and nothing was counted again. */
  replayed: boolean;
};

const clone = <T>(value: T): T => structuredClone(value);

const refuseKey = (operation: string, key: string): never => {
  throw new BillingProblem(
    422,
    `${operation}.InvalidResourceKey`,
    "resourceKey must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-', and neither '.' nor '..'",
    {
      errors: [
        { location: KEY_LOCATION, message: "the key's format", value: key },
      ],
    },
  );
};

const checkKey = (operation: string, key: string) => {
  if (!isResourceKey(key)) {
    refuseKey(operation, key);
  }
};

/** How an `append` report folds into a counter, by aggregation method (api/.../usage/strategies.go). */
function fold(
  current: Counter,
  value: number,
  behavior: Behavior,
  aggregationMethod: AggregationMethod,
): Counter {
  if (behavior === 'set') {
    // A set is one observation of the counter, which a following AVERAGE folds on.
    return { eventCount: 1, value };
  }
  const folded = {
    AVERAGE:
      (current.value * current.eventCount + value) / (current.eventCount + 1),
    COUNT: current.value + 1,
    LATEST: value,
    MAX: value > current.value ? value : current.value,
    MIN: value < current.value ? value : current.value,
    SUM: current.value + value,
  }[aggregationMethod];

  return { eventCount: current.eventCount + 1, value: folded };
}

/** What a limit accepts: its threshold (-1 unlimited) and the percent a soft limit tolerates above it. */
type Limit = { overagePercent: number; threshold: number };

const limitOf = (usage: EntitlementUsage): Limit | undefined =>
  usage.limit?.type === 'number'
    ? {
        overagePercent: usage.limitCapExceededOveragePercent ?? 0,
        threshold: usage.limit.value,
      }
    : undefined;

const isUnlimited = (limit: Limit) => limit.threshold === -1;

/** Whether the limit admits a counter: the threshold, and a soft limit's overage above it. */
const admits = (limit: Limit, counter: number) =>
  isUnlimited(limit) ||
  counter <= limit.threshold + (limit.threshold * limit.overagePercent) / 100;

const asNumber = (counter: Counter) => ({
  event_count: counter.eventCount,
  type: 'number' as const,
  value: counter.value,
});

/**
 * The counters of the entitlements that count per resource, of every instance, and what the
 * four routes below the entitlement and the entitlement's own usage make of them.
 */
export class InstanceEntitlementResources {
  private counters: Record<string, Record<string, ResourceCounter[]>>;
  private maxResources: number;
  private perResource: Record<string, { aggregationMethod: AggregationMethod }>;
  private readonly problems = new ArmedProblems<ResourceOperation>();

  constructor(
    seed: InstanceEntitlementResourcesSeed = {},
    private readonly host: ResourceHost,
  ) {
    this.maxResources = seed.maxResources ?? DEFAULT_MAX_RESOURCES;
    this.perResource = Object.fromEntries(
      Object.entries(seed.perResource ?? {}).map(([slug, facts]) => [
        slug,
        { aggregationMethod: facts.aggregationMethod ?? 'SUM' },
      ]),
    );
    this.counters = Object.fromEntries(
      Object.entries(seed.resources ?? {}).map(([instanceSlug, byPair]) => [
        instanceSlug,
        Object.fromEntries(
          Object.entries(byPair).map(([entitlementSlug, counters]) => {
            if (!this.perResource[entitlementSlug]) {
              throw new Error(
                `InstanceEntitlementResources seed: "${entitlementSlug}" holds resources but does not count per resource`,
              );
            }
            const keys = new Set<string>();
            for (const { resourceKey } of counters) {
              if (!isResourceKey(resourceKey) || keys.has(resourceKey)) {
                throw new Error(
                  `InstanceEntitlementResources seed: "${resourceKey}" is not a key, or is held twice, for ${instanceSlug} / ${entitlementSlug}`,
                );
              }
              keys.add(resourceKey);
            }

            return [
              entitlementSlug,
              counters.map(
                ({ eventCount = 1, resourceKey, value, ...rest }) => ({
                  ...rest,
                  eventCount,
                  resourceKey,
                  value,
                }),
              ),
            ];
          }),
        ),
      ]),
    );
  }

  static fromSerialized(
    state: SerializedInstanceEntitlementResources,
    host: ResourceHost,
  ): InstanceEntitlementResources {
    const model = new InstanceEntitlementResources(
      { maxResources: state.maxResources, perResource: state.perResource },
      host,
    );
    model.counters = clone(state.counters);
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedInstanceEntitlementResources {
    return {
      armedProblems: this.problems.serialize(),
      counters: clone(this.counters),
      maxResources: this.maxResources,
      perResource: clone(this.perResource),
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: ResourceOperation, problem: ArmedBillingProblem) {
    this.problems.arm(operation, problem);
  }

  /** Sets the ceiling of resources an entitlement may count on an instance. */
  setMaxResources(max: number) {
    this.maxResources = max;
  }

  isPerResource(entitlementSlug: string): boolean {
    return this.perResource[entitlementSlug] !== undefined;
  }

  private held(instanceSlug: string, entitlementSlug: string) {
    return this.counters[instanceSlug]?.[entitlementSlug] ?? [];
  }

  /** Whether the pair holds a counter, even one of a closed window. */
  holds(instanceSlug: string, entitlementSlug: string): boolean {
    return this.held(instanceSlug, entitlementSlug).length > 0;
  }

  /** A counter as it reads in `window`: its own when it was counted there, zero when that window has closed. */
  private reading(
    counter: ResourceCounter | undefined,
    window: string | null,
  ): Counter {
    if (
      !counter ||
      (counter.periodStart !== undefined && counter.periodStart !== window)
    ) {
      return ZERO;
    }

    return counter;
  }

  /**
   * The usage rows of an instance with what its entitlements that count per resource say of
   * them, as the API computes it from the counters: `value` is the highest counter of the
   * window the pair is in, the one that holds the lower key when two tie, and `resources` says
   * how many resources hold a counter (whatever their window) and how many of the window's
   * are at the limit. A limit that is unlimited has none to reach.
   */
  decorate(instanceSlug: string, rows: EntitlementUsage[]): EntitlementUsage[] {
    return rows.map((row) => {
      if (!this.isPerResource(row.entitlementSlug)) {
        return row;
      }
      const window = row.currentPeriodStart ?? null;
      const held = this.held(instanceSlug, row.entitlementSlug);
      const limit = limitOf(row);
      const current = held.filter(
        (counter) =>
          counter.periodStart === undefined || counter.periodStart === window,
      );
      let highest: ResourceCounter | undefined;
      for (const counter of current) {
        if (
          !highest ||
          counter.value > highest.value ||
          (counter.value === highest.value &&
            counter.resourceKey < highest.resourceKey)
        ) {
          highest = counter;
        }
      }
      const atLimit =
        limit && !isUnlimited(limit)
          ? current.filter((counter) => counter.value >= limit.threshold).length
          : 0;

      return {
        ...row,
        resources: { atLimit, count: held.length },
        value: asNumber(this.reading(highest, window)),
      };
    });
  }

  /** `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}/usage`. */
  read(
    instanceSlug: string,
    entitlementSlug: string,
    resourceKey: string,
  ): EntitlementUsage {
    const operation = 'GetEntitlementResourceUsage';
    this.problems.consume('getEntitlementResourceUsageMetrics');
    checkKey(operation, resourceKey);
    const pair = this.pairOf(operation, instanceSlug, entitlementSlug);
    this.requirePerResource(operation, entitlementSlug);
    if (!pair.usage) {
      throw new BillingProblem(
        404,
        `${operation}.EntitlementNotAssigned`,
        `Entitlement with slug "${entitlementSlug}" is not assigned to the license used by instance "${instanceSlug}"`,
      );
    }
    const counter = this.held(instanceSlug, entitlementSlug).find(
      (candidate) => candidate.resourceKey === resourceKey,
    );
    const { resources: _resources, ...usage } = pair.usage;

    return {
      ...usage,
      resourceKey,
      value: asNumber(
        this.reading(counter, pair.usage.currentPeriodStart ?? null),
      ),
    };
  }

  /**
   * `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/resources`: the resources
   * that hold a counter, a page at a time in the order of their keys (bytewise), each with
   * its counter in the window the pair is in. A resource outlives a license that no longer
   * grants its entitlement, so the grant is not asked for.
   */
  list(
    instanceSlug: string,
    entitlementSlug: string,
    query: { cursor?: string; limit?: number },
  ): PageEntitlementResource {
    const operation = 'ListEntitlementResources';
    this.problems.consume('listEntitlementResources');
    const after = query.cursor === undefined ? undefined : decode(query.cursor);
    const pair = this.pairOf(operation, instanceSlug, entitlementSlug);
    this.requirePerResource(operation, entitlementSlug);
    const size =
      query.limit && query.limit > 0
        ? Math.min(query.limit, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    const window = pair.usage?.currentPeriodStart ?? null;
    const rows = [...this.held(instanceSlug, entitlementSlug)]
      .sort((left, right) => compareKeys(left.resourceKey, right.resourceKey))
      .filter((counter) => after === undefined || counter.resourceKey > after);
    const page = rows.slice(0, size).map((counter): EntitlementResource => ({
      ...(pair.usage?.currentPeriodStart && pair.usage.currentPeriodEnd
        ? {
            currentPeriodEnd: pair.usage.currentPeriodEnd,
            currentPeriodStart: pair.usage.currentPeriodStart,
          }
        : {}),
      resourceKey: counter.resourceKey,
      value: asNumber(this.reading(counter, window)),
    }));
    const hasMore = rows.length > size;

    return parseContract(
      zPageEntitlementResource,
      {
        hasMore,
        items: page,
        nextCursor: hasMore
          ? encode(page[page.length - 1].resourceKey)
          : undefined,
      },
      'InstanceEntitlementResources.list result',
    );
  }

  /**
   * `DELETE /instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}`:
   * forgets the counter. Idempotent, since a resource that holds none is already forgotten, and
   * it writes no journal row: the journal keeps what the resource's reports did.
   */
  remove(instanceSlug: string, entitlementSlug: string, resourceKey: string) {
    const operation = 'DeleteEntitlementResource';
    this.problems.consume('deleteEntitlementResource');
    checkKey(operation, resourceKey);
    const found = this.host.lookup(instanceSlug, entitlementSlug);
    if (found.found !== 'ok') {
      throw new BillingProblem(
        404,
        `${operation}.ContextNotFound`,
        `instance "${instanceSlug}" or entitlement "${entitlementSlug}" not found`,
      );
    }
    this.requirePerResource(operation, entitlementSlug);
    const pair = this.counters[instanceSlug]?.[entitlementSlug] ?? [];
    const rest = pair.filter((counter) => counter.resourceKey !== resourceKey);
    if (rest.length < pair.length) {
      this.counters[instanceSlug][entitlementSlug] = rest;
    }
  }

  /**
   * `POST /instances/{instanceSlug}/entitlements/{entitlementSlug}/resources/{resourceKey}/usage`.
   * The checks come in the order of the API's: what the request says of itself, then the pair
   * and its route, the replay of a key already accepted, the grant, the ceiling of resources,
   * and last the gate of the limit, on the counter the report would leave. A report that is
   * refused creates no counter and leaves no journal row.
   */
  report(
    instanceSlug: string,
    entitlementSlug: string,
    resourceKey: string,
    body: ReportBody,
    idempotency: IdempotencyHeader,
  ): ReportOutcome {
    const operation = 'ReportEntitlementUsageMetric';
    this.problems.consume('reportEntitlementResourceUsageMetric');
    checkKey(operation, resourceKey);
    if (body.value?.type === 'ai_usage') {
      throw new BillingProblem(
        422,
        `${operation}.InvalidValueType`,
        "a resource's usage is reported as a number: ai_usage is for an AI credit pool, which counts per instance",
        {
          errors: [
            { location: 'body.value.type', message: 'send a number value' },
          ],
        },
      );
    }
    if (body.behavior !== 'append' && body.behavior !== 'set') {
      throw new BillingProblem(
        422,
        `${operation}.InvalidBehavior`,
        'behavior must be one of: append, set',
      );
    }
    if (body.value?.type !== 'number') {
      throw new BillingProblem(
        422,
        `${operation}.InvalidValueType`,
        'value must be a number or ai_usage input for usage reporting',
      );
    }
    if (idempotency.sent && !IDEMPOTENCY_KEY.test(idempotency.key ?? '')) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidTransactionId`,
        "Idempotency-Key must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-'",
        {
          errors: [
            {
              location: 'header.Idempotency-Key',
              message: "the key's format",
              value: idempotency.key,
            },
          ],
        },
      );
    }
    const transactionId = idempotency.sent ? idempotency.key : undefined;
    const value = body.value.value;
    const journal = this.host.journal();

    const pair = this.host.lookup(instanceSlug, entitlementSlug);
    if (pair.found !== 'ok') {
      throw contextNotFound(instanceSlug, entitlementSlug);
    }
    if (!this.isPerResource(entitlementSlug)) {
      throw new BillingProblem(
        422,
        `${operation}.ResourceKeyNotAllowed`,
        `entitlement "${entitlementSlug}" counts per instance: report its usage at POST /instances/{instanceSlug}/entitlements/${entitlementSlug}/usage`,
        {
          errors: [
            {
              location: KEY_LOCATION,
              message: 'the entitlement has no resources',
              value: resourceKey,
            },
          ],
        },
      );
    }

    const original = transactionId
      ? journal.findByTransaction(
          instanceSlug,
          entitlementSlug,
          resourceKey,
          transactionId,
        )
      : undefined;
    if (original) {
      if (
        original.behavior !== body.behavior ||
        Number(original.reportedValue) !== value
      ) {
        throw new BillingProblem(
          409,
          `${operation}.TransactionIdReused`,
          'transactionId already used for another report; send a correction under a new key',
          {
            errors: [
              {
                location: 'header.Idempotency-Key',
                message:
                  'the report this transactionId was first accepted with',
                value: {
                  behavior: original.behavior,
                  reportSeq: original.reportSeq,
                  reportedAt: original.reportedAt,
                  value: Number(original.reportedValue),
                },
              },
            ],
          },
        );
      }

      return {
        body: replayOf(original, pair.usage, entitlementSlug, resourceKey),
        replayed: true,
      };
    }

    const usage = pair.usage;
    const limit = usage && limitOf(usage);
    if (!usage || !limit) {
      throw contextNotFound(instanceSlug, entitlementSlug);
    }
    const held = this.held(instanceSlug, entitlementSlug);
    const stored = held.find((counter) => counter.resourceKey === resourceKey);
    if (!stored && held.length >= this.maxResources) {
      throw new BillingProblem(
        422,
        `${operation}.ResourceLimitReached`,
        `this instance already holds the most resources an entitlement may count (${this.maxResources}): delete one that no longer exists, or report for one that does`,
        {
          errors: [
            {
              location: KEY_LOCATION,
              message: 'a resource this entitlement does not count yet',
              value: resourceKey,
            },
          ],
        },
      );
    }

    const window = usage.currentPeriodStart ?? null;
    const aggregationMethod =
      this.perResource[entitlementSlug].aggregationMethod;
    const before = this.reading(stored, window);
    const after = fold(before, value, body.behavior, aggregationMethod);
    if (!admits(limit, after.value)) {
      throw new BillingProblem(
        409,
        `${operation}.ThresholdExceeded`,
        `Usage for ${entitlementSlug} exceeds the allowed threshold`,
      );
    }

    const next: ResourceCounter = {
      ...after,
      periodStart: window,
      resourceKey,
    };
    this.counters[instanceSlug] ??= {};
    this.counters[instanceSlug][entitlementSlug] = [
      ...held.filter((counter) => counter.resourceKey !== resourceKey),
      next,
    ];
    const overage = (counter: number) =>
      isUnlimited(limit) ? 0 : Math.max(0, counter - limit.threshold);
    journal.append(instanceSlug, entitlementSlug, {
      aggregationMethod,
      behavior: body.behavior,
      delta: String(after.value - before.value),
      entitlementId: stableUuid(entitlementSlug),
      eventCountAfter: after.eventCount,
      instanceId: stableUuid(instanceSlug),
      licenseId: stableUuid(usage.licenseId),
      limitValue: isUnlimited(limit) ? null : String(limit.threshold),
      overageDelta: String(overage(after.value) - overage(before.value)),
      overagePercent: isUnlimited(limit) ? null : limit.overagePercent,
      properties: body.metadata ?? null,
      reportedValue: String(value),
      resourceKey,
      transactionId: transactionId ?? null,
      valueAfter: String(after.value),
      valueBefore: String(before.value),
      windowEnd: usage.currentPeriodEnd ?? null,
      windowStart: usage.currentPeriodStart ?? null,
    });
    const { resources: _resources, ...served } = usage;

    return {
      body: {
        ...served,
        provenance: usage.provenance ?? null,
        resourceKey,
        source: usage.source,
        transactionId: transactionId ?? null,
        value: asNumber(after),
      },
      replayed: false,
    };
  }

  /** Looks the pair up and refuses with the 404 of `operation` when there is none. */
  private pairOf(
    operation: string,
    instanceSlug: string,
    entitlementSlug: string,
  ): KnownPair {
    const pair = this.host.lookup(instanceSlug, entitlementSlug);
    if (pair.found !== 'ok') {
      throw new BillingProblem(
        404,
        pair.found === 'instance'
          ? `${operation}.InstanceNotFound`
          : `${operation}.EntitlementNotFound`,
        pair.found === 'instance'
          ? `Instance with slug "${instanceSlug}" not found`
          : `Entitlement with slug "${entitlementSlug}" not found`,
      );
    }

    return pair;
  }

  private requirePerResource(operation: string, entitlementSlug: string) {
    if (!this.isPerResource(entitlementSlug)) {
      throw new BillingProblem(
        422,
        `${operation}.NotPerResource`,
        `entitlement "${entitlementSlug}" counts per instance: it has no resources`,
      );
    }
  }
}

const contextNotFound = (instanceSlug: string, entitlementSlug: string) =>
  new BillingProblem(
    404,
    'ReportEntitlementUsageMetric.ContextNotFound',
    `instance "${instanceSlug}" or entitlement "${entitlementSlug}" not found, or entitlement is not licensed for this instance`,
  );

/** Bytewise, as the API orders keys (`COLLATE "C"`): code units of an ASCII alphabet. */
const compareKeys = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

/** The cursor of a page: opaque to the console, the key the page stopped at to the model. */
const encode = (resourceKey: string) => btoa(JSON.stringify({ resourceKey }));

const decode = (cursor: string): string => {
  try {
    const parsed = JSON.parse(atob(cursor)) as { resourceKey?: unknown };
    if (typeof parsed.resourceKey === 'string') {
      return parsed.resourceKey;
    }
  } catch {
    // The same answer as a cursor that is not one.
  }
  throw new BillingProblem(
    400,
    'ListEntitlementResources.InvalidCursor',
    'invalid cursor',
  );
};

/**
 * What a report answers when its key was accepted before: rebuilt from the journal row alone,
 * as the API does it, so the counter, the window and the limit are those of the day, and
 * neither the source nor the provenance, which the journal does not store.
 */
function replayOf(
  original: UsageReport,
  usage: EntitlementUsage | undefined,
  entitlementSlug: string,
  resourceKey: string,
): ReportedEntitlementUsage {
  return {
    ...(original.windowStart && original.windowEnd
      ? {
          currentPeriodEnd: original.windowEnd,
          currentPeriodStart: original.windowStart,
        }
      : {}),
    entitlementId: usage?.entitlementId ?? original.entitlementId,
    entitlementSlug,
    licenseId: usage?.licenseId ?? original.licenseId,
    licenseSlug: usage?.licenseSlug ?? '',
    limit: {
      type: 'number',
      value: original.limitValue === null ? -1 : Number(original.limitValue),
    },
    limitCapExceededOveragePercent: original.overagePercent ?? -1,
    provenance: null,
    resourceKey,
    source: null,
    transactionId: original.transactionId,
    value: asNumber({
      eventCount: original.eventCountAfter,
      value: Number(original.valueAfter),
    }),
  };
}
