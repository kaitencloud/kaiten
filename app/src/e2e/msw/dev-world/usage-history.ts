import type { UsageReport } from '@/api-client';
import { buildUsageReport } from '../../../../e2e/app/_support/fixtures/build-invoice';
import { uuidFor } from './billing';
import { daysAgo } from './dates';

/**
 * The journal of the calls two instances made, one report every few hours: more
 * than a page of it (the console reads a hundred at a time) for Globex
 * Production, which is billed for the calls above its allowance, and a short
 * one for Gamma Production. Each report raises the counter of the month it was
 * made in and carries the limit in force then, so that the history reads as the
 * API writes it.
 */

const HOUR_MS = 60 * 60 * 1000;

function callsJournal(
  instanceSlug: string,
  count: number,
  everyHours: number,
  limit: number,
  step: number,
): UsageReport[] {
  const reports: UsageReport[] = [];
  const first = Date.now() - count * everyHours * HOUR_MS;
  let counter = 0;
  let window = '';

  for (let index = 0; index < count; index += 1) {
    const reportedAt = new Date(first + index * everyHours * HOUR_MS);
    // A calendar month, the reset period of the calls.
    const windowStart = new Date(
      Date.UTC(reportedAt.getUTCFullYear(), reportedAt.getUTCMonth(), 1),
    ).toISOString();
    const windowEnd = new Date(
      Date.UTC(reportedAt.getUTCFullYear(), reportedAt.getUTCMonth() + 1, 1),
    ).toISOString();
    if (windowStart !== window) {
      window = windowStart;
      counter = 0;
    }
    const amount = step + ((index * 37) % 11) * 10;
    const before = counter;
    counter += amount;
    reports.push(
      buildUsageReport({
        delta: String(amount),
        entitlementId: uuidFor('api-calls'),
        instanceId: uuidFor(instanceSlug),
        limitValue: String(limit),
        overageDelta: String(
          Math.max(0, counter - limit) - Math.max(0, before - limit),
        ),
        reportSeq: index + 1,
        reportedAt: reportedAt.toISOString(),
        reportedValue: String(amount),
        valueAfter: String(counter),
        valueBefore: String(before),
        windowEnd,
        windowStart,
      }),
    );
  }

  return reports;
}

/**
 * The reports that brought Acme Production to the counters of its competitors: Stigg to 2,
 * Schematic to 4 (its limit) and Paid to 3. They share the number of the entitlement's journal,
 * so the reports of one competitor are not contiguous in it.
 */
function competitorsJournal(): UsageReport[] {
  const day = 24 * 60 * 60 * 1000;
  const row = (
    reportSeq: number,
    resourceKey: string,
    reportedValue: number,
    valueBefore: number,
    daysAgo: number,
  ): UsageReport => ({
    aggregationMethod: 'SUM',
    behavior: 'append',
    delta: String(reportedValue),
    entitlementId: uuidFor('sources-per-competitor'),
    eventCountAfter: reportSeq === 4 ? 2 : 1,
    instanceId: uuidFor('acme-production'),
    licenseId: uuidFor('license-enterprise-v2'),
    limitValue: '4',
    overageDelta: '0',
    overagePercent: 0,
    properties: null,
    reportSeq,
    reportedAt: new Date(Date.now() - daysAgo * day).toISOString(),
    reportedValue: String(reportedValue),
    resourceKey,
    transactionId: null,
    valueAfter: String(valueBefore + reportedValue),
    valueBefore: String(valueBefore),
    windowEnd: null,
    windowStart: null,
  });

  return [
    row(1, 'stigg', 1, 0, 12),
    row(2, 'schematic', 4, 0, 9),
    row(3, 'paid', 3, 0, 6),
    row(4, 'stigg', 1, 1, 2),
  ];
}

/** The usage history of the world, by instance and entitlement. */
export const createUsageReports = (): Record<
  string,
  Record<string, UsageReport[]>
> => ({
  'acme-production': {
    'sources-per-competitor': competitorsJournal(),
  },
  'gamma-production': {
    'api-calls': callsJournal('gamma-production', 14, 11, 10_000, 60),
  },
  'globex-production': {
    'api-calls': callsJournal('globex-production', 137, 4, 100_000, 800),
  },
});

/** Where the usage that is kept begins: the stack keeps 18 months. */
export const createRetentionStart = (): string => daysAgo(18 * 30);

/**
 * How far the start of the kept usage moves on between two requests: the 14 ms
 * observed on the stack between a refusal that names it and the next request.
 */
export const RETENTION_SLIDE_MS = 14;
