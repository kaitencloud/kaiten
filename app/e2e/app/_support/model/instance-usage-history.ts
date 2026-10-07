import { z } from 'zod';
import type { UsageReport, UsageReportPage } from '@/api-client';
import { zUsageReport } from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ArmedProblems, type ArmedBillingProblem } from './armed-problems';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SPAN_MS = 30 * DAY_MS;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
/** The longest range one export of an entitlement of an instance reads. */
const MAX_PAIR_EXPORT_SPAN_MS = 366 * DAY_MS;
/** The longest range one export of the whole organization reads. */
const MAX_ORGANIZATION_EXPORT_SPAN_MS = 31 * DAY_MS;

export type UsageHistoryProblemOperation =
  | 'exportOrganizationUsageReports'
  | 'exportUsageReports'
  | 'listUsageReports';

export type InstanceUsageHistorySeed = {
  /** Where the usage the organization keeps begins; none keeps it all. */
  retentionStart?: string;
  /** The journal of each entitlement of each instance, by slugs, in `reportSeq` order. */
  usageReports?: Record<string, Record<string, UsageReport[]>>;
};

export type SerializedInstanceUsageHistory = {
  armedProblems: Array<[UsageHistoryProblemOperation, ArmedBillingProblem]>;
  retentionStart: string | null;
  usageReports: Record<string, Record<string, UsageReport[]>>;
};

/** A file an export streams: its body and the media type it answers with. */
export type UsageExport = { body: string; contentType: string };

const CSV_HEADER = [
  'organization_id',
  'instance_id',
  'entitlement_id',
  'report_seq',
  'reported_at',
  'behavior',
  'aggregation_method',
  'reported_value',
  'value_before',
  'value_after',
  'delta',
  'overage_delta',
  'event_count_after',
  'window_start',
  'window_end',
  'limit_value',
  'overage_percent',
  'license_id',
  'transaction_id',
  'properties',
];

const csvCell = (value: unknown) => {
  const text =
    value === undefined || value === null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The format the API writes the bounds of a range in: UTC, to the millisecond. */
const instant = (time: number) => new Date(time).toISOString();

type ReportRow = {
  entitlementSlug: string;
  instanceSlug: string;
  report: UsageReport;
};

/**
 * The usage history of the instances: the journal of each entitlement, read a
 * page at a time and exported, within what the organization keeps, as the Core
 * API serves it (api/internal/modules/instances/listusagereports,
 * exportusagereports, exportorganizationusagereports). A range that starts
 * before the history does is refused with its start, the default range is moved
 * up to it, and an export is bounded in length, all with the codes of the API.
 * The history is never gated by billing.
 */
export class InstanceUsageHistory {
  private readonly problems = new ArmedProblems<UsageHistoryProblemOperation>();
  private retentionStart: string | null;
  private usageReports: Record<string, Record<string, UsageReport[]>>;

  constructor(
    seed: InstanceUsageHistorySeed = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.retentionStart = seed.retentionStart ?? null;
    this.usageReports = Object.fromEntries(
      Object.entries(seed.usageReports ?? {}).map(([instanceSlug, byPair]) => [
        instanceSlug,
        Object.fromEntries(
          Object.entries(byPair).map(([entitlementSlug, reports]) => [
            entitlementSlug,
            parseContract(
              z.array(zUsageReport),
              reports,
              `InstanceUsageHistory seed.usageReports[${instanceSlug}][${entitlementSlug}]`,
            )
              .map(clone)
              .sort((left, right) => left.reportSeq - right.reportSeq),
          ]),
        ),
      ]),
    );
  }

  static fromSerialized(
    state: SerializedInstanceUsageHistory,
    now?: () => number,
  ): InstanceUsageHistory {
    const model = new InstanceUsageHistory(
      {
        retentionStart: state.retentionStart ?? undefined,
        usageReports: state.usageReports,
      },
      now,
    );
    for (const [operation, problem] of state.armedProblems) {
      model.problems.arm(operation, problem);
    }

    return model;
  }

  serialize(): SerializedInstanceUsageHistory {
    return {
      armedProblems: this.problems.serialize(),
      retentionStart: this.retentionStart,
      usageReports: clone(this.usageReports),
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(
    operation: UsageHistoryProblemOperation,
    problem: ArmedBillingProblem,
  ) {
    this.problems.arm(operation, problem);
  }

  /** Moves the start of the history: the usage before it is no longer kept. */
  setRetentionStart(start: string | null) {
    this.retentionStart = start;
  }

  /** Whether the journal holds a pair of this instance and this entitlement, even an empty one. */
  hasPair(instanceSlug: string, entitlementSlug: string): boolean {
    return this.usageReports[instanceSlug]?.[entitlementSlug] !== undefined;
  }

  private reportsOf(instanceSlug: string, entitlementSlug: string) {
    return this.usageReports[instanceSlug]?.[entitlementSlug] ?? [];
  }

  /**
   * The range a request reads, resolved as the API does: `to` defaults to now,
   * `from` to thirty days before it; an explicit `from` before the history is
   * refused with where it starts, a defaulted one is moved up to it; an empty
   * range is invalid, and one longer than the operation allows is too large.
   */
  private resolveRange(
    operation: string,
    from: string | undefined,
    to: string | undefined,
    maxSpan: number,
  ): { from: number; to: number } {
    const now = this.now();
    const retention =
      this.retentionStart === null ? null : Date.parse(this.retentionStart);
    const end = to === undefined ? now : Date.parse(to);
    let start: number;
    if (from !== undefined) {
      start = Date.parse(from);
      if (retention !== null && start < retention) {
        throw this.outsideRetention(operation, retention);
      }
    } else {
      start = end - DEFAULT_SPAN_MS;
      if (retention !== null && start < retention) {
        start = retention;
      }
    }
    if (start >= end) {
      if (retention !== null && end <= retention) {
        throw this.outsideRetention(operation, retention);
      }
      throw new BillingProblem(
        422,
        `${operation}.InvalidRange`,
        'from must be before to',
      );
    }
    if (maxSpan > 0 && end - start > maxSpan) {
      throw new BillingProblem(
        422,
        `${operation}.RangeTooLarge`,
        `the range spans more than ${Math.round(maxSpan / DAY_MS)} days; split it`,
      );
    }

    return { from: start, to: end };
  }

  private outsideRetention(operation: string, retention: number) {
    const start = instant(retention);

    return new BillingProblem(
      422,
      `${operation}.OutsideRetention`,
      `the usage history is kept from ${start}: from must not be earlier`,
      {
        errors: [
          { location: 'query.from', message: 'retentionStart', value: start },
        ],
      },
    );
  }

  private checkPair(
    operation: string,
    instanceSlug: string,
    entitlementSlug: string,
    knows: (
      instanceSlug: string,
      entitlementSlug: string,
    ) => 'ok' | 'instance' | 'entitlement',
  ) {
    const found = knows(instanceSlug, entitlementSlug);
    if (found === 'instance') {
      throw new BillingProblem(
        404,
        `${operation}.InstanceNotFound`,
        `instance "${instanceSlug}" not found`,
      );
    }
    if (found === 'entitlement') {
      throw new BillingProblem(
        404,
        `${operation}.EntitlementNotFound`,
        `entitlement "${entitlementSlug}" not found`,
      );
    }
  }

  /**
   * `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports`:
   * one page of the journal, in `reportSeq` order.
   */
  listUsageReports(
    instanceSlug: string,
    entitlementSlug: string,
    query: {
      afterSeq?: number;
      from?: string;
      limit?: number;
      to?: string;
      transactionId?: string;
    },
    knows: (
      instanceSlug: string,
      entitlementSlug: string,
    ) => 'ok' | 'instance' | 'entitlement',
  ): UsageReportPage {
    this.problems.consume('listUsageReports');
    this.checkPair('ListUsageReports', instanceSlug, entitlementSlug, knows);
    const range = this.resolveRange(
      'ListUsageReports',
      query.from,
      query.to,
      0,
    );
    const size = Math.min(
      query.limit && query.limit > 0 ? query.limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const rows = this.reportsOf(instanceSlug, entitlementSlug).filter(
      (report) =>
        report.reportSeq > (query.afterSeq ?? 0) &&
        Date.parse(report.reportedAt) >= range.from &&
        Date.parse(report.reportedAt) < range.to &&
        (query.transactionId === undefined ||
          report.transactionId === query.transactionId),
    );
    const page = rows.slice(0, size);
    const last = page.at(-1);

    return {
      items: clone(page),
      nextAfterSeq:
        rows.length > size && last !== undefined ? last.reportSeq : undefined,
    };
  }

  private encode(rows: ReportRow[], format: string | undefined): UsageExport {
    const wanted = format || 'csv';
    if (wanted !== 'csv' && wanted !== 'json') {
      throw new BillingProblem(
        422,
        'ExportUsageReports.InvalidFormat',
        'format must be one of: csv, json',
      );
    }
    if (wanted === 'json') {
      return {
        body: rows.map(({ report }) => JSON.stringify(report)).join('\n'),
        contentType: 'application/x-ndjson',
      };
    }
    const lines = rows.map(({ report }) =>
      [
        'org-e2e',
        report.instanceId,
        report.entitlementId,
        report.reportSeq,
        report.reportedAt,
        report.behavior,
        report.aggregationMethod,
        report.reportedValue,
        report.valueBefore,
        report.valueAfter,
        report.delta,
        report.overageDelta,
        report.eventCountAfter,
        report.windowStart,
        report.windowEnd,
        report.limitValue,
        report.overagePercent,
        report.licenseId,
        report.transactionId,
        report.properties,
      ]
        .map(csvCell)
        .join(','),
    );

    return {
      body: `${[CSV_HEADER.join(','), ...lines].join('\n')}\n`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  /**
   * `GET /instances/{instanceSlug}/entitlements/{entitlementSlug}/usage/reports/export`:
   * every report of the pair in the range, as a file, for at most 366 days.
   */
  exportUsageReports(
    instanceSlug: string,
    entitlementSlug: string,
    query: { format?: string; from?: string; to?: string },
    knows: (
      instanceSlug: string,
      entitlementSlug: string,
    ) => 'ok' | 'instance' | 'entitlement',
  ): UsageExport {
    this.problems.consume('exportUsageReports');
    this.checkPair('ExportUsageReports', instanceSlug, entitlementSlug, knows);
    const range = this.resolveRange(
      'ExportUsageReports',
      query.from,
      query.to,
      MAX_PAIR_EXPORT_SPAN_MS,
    );

    return this.encode(
      this.reportsOf(instanceSlug, entitlementSlug)
        .filter(
          (report) =>
            Date.parse(report.reportedAt) >= range.from &&
            Date.parse(report.reportedAt) < range.to,
        )
        .map((report) => ({ entitlementSlug, instanceSlug, report })),
      query.format,
    );
  }

  /**
   * `GET /usage/reports/export`: every report of the organization in the range,
   * ordered by when it was made, as a file, for at most 31 days.
   */
  exportOrganizationUsageReports(query: {
    entitlementSlug?: string;
    format?: string;
    from?: string;
    instanceSlug?: string;
    to?: string;
  }): UsageExport {
    this.problems.consume('exportOrganizationUsageReports');
    const range = this.resolveRange(
      'ExportUsageReports',
      query.from,
      query.to,
      MAX_ORGANIZATION_EXPORT_SPAN_MS,
    );
    const rows: ReportRow[] = [];
    for (const [instanceSlug, byPair] of Object.entries(this.usageReports)) {
      if (query.instanceSlug && query.instanceSlug !== instanceSlug) {
        continue;
      }
      for (const [entitlementSlug, reports] of Object.entries(byPair)) {
        if (
          query.entitlementSlug &&
          query.entitlementSlug !== entitlementSlug
        ) {
          continue;
        }
        for (const report of reports) {
          const at = Date.parse(report.reportedAt);
          if (at >= range.from && at < range.to) {
            rows.push({ entitlementSlug, instanceSlug, report });
          }
        }
      }
    }
    rows.sort(
      (left, right) =>
        Date.parse(left.report.reportedAt) -
          Date.parse(right.report.reportedAt) ||
        left.instanceSlug.localeCompare(right.instanceSlug) ||
        left.entitlementSlug.localeCompare(right.entitlementSlug) ||
        left.report.reportSeq - right.report.reportSeq,
    );

    return this.encode(rows, query.format);
  }
}
