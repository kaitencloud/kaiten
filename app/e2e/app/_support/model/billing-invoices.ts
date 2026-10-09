import { z } from 'zod';
import type {
  ErrorDetail,
  HandoffBooking,
  Invoice,
  InvoicePayment,
  InvoiceSummary,
  LineReportPage,
  PageInvoiceSummary,
  PageQueuedInvoice,
  QueuedInvoice,
  UsageReport,
} from '@/api-client';
import { zInvoice, zUsageReport } from '@/api-client/zod.gen';
import { CURRENCY_EXPONENTS } from '@/lib/currency-exponents';
import { parseContract } from '../contracts/openapi-contract';
import { BillingProblem } from './billing-problem';

const clone = <T>(value: T): T => structuredClone(value);

/** The characters of a text as the API counts them: runes, not UTF-16 units. */
const runeCount = (text: string) => Array.from(text).length;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const DEFAULT_REPORTS_PAGE_SIZE = 100;
const MAX_REPORTS_PAGE_SIZE = 500;
const MAX_REASON = 500;
const MAX_EXTERNAL_REFERENCE = 255;
const DAY_MS = 24 * 60 * 60 * 1000;
/** How many reads of an invoice pass before the job of the push queue has run for it. */
const PUSH_JOB_AFTER_READS = 2;
/** Who acts in the mocks: the signed-in user of every spec. */
const ACTOR = 'user-e2e';

/** What a mock of the invoices arms to fail with a problem document, once. */
export type InvoiceProblemOperation =
  | 'ackHandoff'
  | 'exportInvoices'
  | 'getInvoice'
  | 'listHandoff'
  | 'listInvoices'
  | 'listLineReports'
  | 'markPaid'
  | 'recompose'
  | 'releaseHold'
  | 'retryPush'
  | 'syncInvoice'
  | 'voidInvoice'
  | 'writeOff';

/**
 * What the payment provider says of an invoice now, which Kaiten only knows once
 * it has read it back: a customer who paid on the hosted page, or a draft someone
 * finalized in the provider's dashboard, changes this and not the invoice.
 */
export type ProviderTruth =
  | 'deleted'
  | 'draft'
  | 'open'
  | 'paid'
  | 'uncollectible'
  | 'void';

export type ArmedInvoiceProblem = {
  /** How many calls of the operation go through before the one that fails. */
  after?: number;
  code?: string;
  /**
   * What someone else did to an invoice just before the refusal, so that a 409
   * says what is true: the invoice is left in this status, and a screen that
   * reads it again finds it so.
   */
  concurrently?: {
    invoiceId: string;
    status: 'PAID' | 'UNCOLLECTIBLE' | 'VOID';
  };
  detail: string;
  errorId?: string;
  errors?: ErrorDetail[];
  /** What `Retry-After` says, when the refusal carries it. */
  retryAfterSeconds?: number;
  status: number;
};

/** The filters of `GET /invoices`, as the handler reads them from the URL. */
export type InvoiceListQuery = {
  boundaryFrom?: string;
  boundaryTo?: string;
  cursor?: string;
  customerSlug?: string;
  handoffStatus?: string;
  held?: boolean;
  instanceSlug?: string;
  issuedFrom?: string;
  issuedTo?: string;
  kind?: string;
  limit?: number;
  overdue?: boolean;
  providerKind?: string;
  status?: string[];
};

export type BillingInvoicesSeed = {
  /** The slugs of instances that were deleted: their invoices cannot be recomposed. */
  deletedInstances?: string[];
  /** Days until due of an invoice issued by a release or a recompose. */
  defaultDaysUntilDue?: number;
  invoices?: Invoice[];
  /** The usage journal behind each metered line, by line id. */
  lineReports?: Record<string, UsageReport[]>;
  /**
   * What the payment provider says of an invoice it holds, by invoice id, when it
   * is not what Kaiten last read: an invoice paid at the provider, not yet synced.
   */
  providerTruth?: Record<string, ProviderTruth>;
  /**
   * Invoices whose push keeps failing, by invoice id, with the provider's error:
   * pushing one again fails again.
   */
  pushFailures?: Record<string, string>;
  /**
   * Invoices the push queue never gets to, by invoice id: the job is slow, and pushing
   * one again leaves it queued for as long as a page is willing to wait.
   */
  stalledPushes?: string[];
  /** Where the usage the organization keeps begins; none keeps it all. */
  retentionStart?: string;
};

export type SerializedBillingInvoices = {
  armedProblems: Array<[InvoiceProblemOperation, ArmedInvoiceProblem]>;
  deletedInstances: string[];
  defaultDaysUntilDue: number;
  invoices: Invoice[];
  lineReports: Record<string, UsageReport[]>;
  /** The invoices queued for a push, with the reads left until the job runs; a state stored before there were providers has none. */
  pushQueue?: Record<string, number>;
  providerTruth?: Record<string, ProviderTruth>;
  pushFailures?: Record<string, string>;
  stalledPushes?: string[];
  retentionStart: string | null;
  sequence: number;
};

type CursorKey = { at: string; id: string };

const encodeCursor = (key: CursorKey) =>
  btoa(JSON.stringify(key)).replace(/\+/g, '-').replace(/\//g, '_');

function decodeCursor(cursor: string, code: string): CursorKey {
  try {
    const key = JSON.parse(
      atob(cursor.replace(/-/g, '+').replace(/_/g, '/')),
    ) as Partial<CursorKey>;
    if (typeof key.at === 'string' && typeof key.id === 'string') {
      return { at: key.at, id: key.id };
    }
  } catch {
    // Falls through to the refusal below.
  }
  throw new BillingProblem(
    400,
    code,
    'the cursor is not one this list returned',
  );
}

const byNewest = (left: Invoice, right: Invoice) =>
  Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
  right.id.localeCompare(left.id);

const byOldestIssue = (left: Invoice, right: Invoice) =>
  Date.parse(left.issuedAt ?? left.createdAt) -
    Date.parse(right.issuedAt ?? right.createdAt) ||
  left.id.localeCompare(right.id);

/** What `GET /invoices` lists of an invoice: everything but its lines. */
export function toSummary(invoice: Invoice): InvoiceSummary {
  return {
    boundaryAt: invoice.boundaryAt,
    collectionMethod: invoice.collectionMethod,
    createdAt: invoice.createdAt,
    currency: invoice.currency,
    customerName: invoice.customerName,
    customerSlug: invoice.customerSlug,
    daysUntilDue: invoice.daysUntilDue,
    discountTotal: invoice.discountTotal,
    dueAt: invoice.dueAt,
    handoffStatus: invoice.handoffStatus,
    holdReason: invoice.holdReason,
    id: invoice.id,
    instanceName: invoice.instanceName,
    instanceSlug: invoice.instanceSlug,
    issuedAt: invoice.issuedAt,
    kind: invoice.kind,
    licenseSlug: invoice.licenseSlug,
    paidAt: invoice.paidAt,
    providerKind: invoice.providerKind,
    serviceFrom: invoice.serviceFrom,
    serviceTo: invoice.serviceTo,
    status: invoice.status,
    subtotal: invoice.subtotal,
    total: invoice.total,
    updatedAt: invoice.updatedAt,
  };
}

const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',');

const INVOICE_COLUMNS = [
  'invoice_id',
  'kind',
  'boundary_at',
  'status',
  'provider_kind',
  'customer_slug',
  'customer_name',
  'instance_slug',
  'license_slug',
  'billing_email',
  'currency',
  'currency_exponent',
  'issued_at',
  'due_at',
  'service_from',
  'service_to',
];
const LINE_COLUMNS = [
  'line_seq',
  'line_type',
  'line_label',
  'line_description',
  'quantity',
  'unit_amount_decimal',
  'line_amount_minor',
  'line_service_from',
  'line_service_to',
  'entitlement_slug',
  'voucher_id',
];
const TOTAL_COLUMNS = [
  'subtotal_minor',
  'discount_total_minor',
  'total_minor',
  'external_reference',
  'handoff_status',
];
const REPORT_COLUMNS = [
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
];

/** A file an export streams: its body and the media type it answers with. */
export type ExportedFile = { body: string; contentType: string };

/**
 * The invoices of the organization, their handoff queue and the usage journal
 * behind their metered lines. It answers as the Core API does, refusals and
 * their codes included (api/internal/modules/billing), so that the console is
 * exercised against the reasons it will really be given. An action changes an
 * invoice the way the API does: what a screen shows after it is what the API
 * would answer.
 */
export class BillingInvoices {
  private readonly armed = new Map<
    InvoiceProblemOperation,
    ArmedInvoiceProblem
  >();
  private deleted: Set<string>;
  private defaultDaysUntilDue: number;
  private invoices: Invoice[];
  private providerTruth: Map<string, ProviderTruth>;
  /** The invoices queued for a push: the reads left until the job of the provider runs. */
  private pushQueue = new Map<string, number>();
  private pushFailures: Map<string, string>;
  private stalledPushes: Set<string>;
  private reports: Map<string, UsageReport[]>;
  private retentionStart: string | null;
  private sequence = 1;

  constructor(
    seed: BillingInvoicesSeed = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.invoices = parseContract(
      z.array(zInvoice),
      seed.invoices ?? [],
      'BillingInvoices seed.invoices',
    ).map(clone);
    this.reports = new Map(
      Object.entries(seed.lineReports ?? {}).map(([lineId, rows]) => [
        lineId,
        parseContract(
          z.array(zUsageReport),
          rows,
          `BillingInvoices seed.lineReports[${lineId}]`,
        ).map(clone),
      ]),
    );
    this.deleted = new Set(seed.deletedInstances ?? []);
    this.defaultDaysUntilDue = seed.defaultDaysUntilDue ?? 30;
    this.providerTruth = new Map(Object.entries(seed.providerTruth ?? {}));
    this.pushFailures = new Map(Object.entries(seed.pushFailures ?? {}));
    this.stalledPushes = new Set(seed.stalledPushes ?? []);
    this.retentionStart = seed.retentionStart ?? null;
  }

  static fromSerialized(
    state: SerializedBillingInvoices,
    now?: () => number,
  ): BillingInvoices {
    const model = new BillingInvoices(
      {
        defaultDaysUntilDue: state.defaultDaysUntilDue,
        deletedInstances: state.deletedInstances,
        invoices: state.invoices,
        lineReports: state.lineReports,
        providerTruth: state.providerTruth,
        pushFailures: state.pushFailures,
        retentionStart: state.retentionStart ?? undefined,
        stalledPushes: state.stalledPushes,
      },
      now,
    );
    model.sequence = state.sequence;
    model.pushQueue = new Map(Object.entries(state.pushQueue ?? {}));
    for (const [operation, problem] of state.armedProblems) {
      model.armed.set(operation, problem);
    }

    return model;
  }

  serialize(): SerializedBillingInvoices {
    return {
      armedProblems: [...this.armed.entries()].map(([operation, problem]) => [
        operation,
        clone(problem),
      ]),
      defaultDaysUntilDue: this.defaultDaysUntilDue,
      deletedInstances: [...this.deleted],
      invoices: clone(this.invoices),
      lineReports: Object.fromEntries(
        [...this.reports.entries()].map(([lineId, rows]) => [
          lineId,
          clone(rows),
        ]),
      ),
      providerTruth: Object.fromEntries(this.providerTruth),
      pushFailures: Object.fromEntries(this.pushFailures),
      pushQueue: Object.fromEntries(this.pushQueue),
      stalledPushes: [...this.stalledPushes],
      retentionStart: this.retentionStart,
      sequence: this.sequence,
    };
  }

  /** Arm the next call of an operation to fail with a problem document. One-shot. */
  armProblem(operation: InvoiceProblemOperation, problem: ArmedInvoiceProblem) {
    this.armed.set(operation, problem);
  }

  /** The days an invoice issued from now on is due after its issue: the organization's terms. */
  setDefaultDaysUntilDue(days: number) {
    this.defaultDaysUntilDue = days;
  }

  /**
   * Adds an invoice the API composed, such as the activation of a subscription,
   * which the subscriptions of the mocks issue. The invoice is checked against
   * the contract.
   */
  addInvoice(invoice: Invoice): Invoice {
    const [checked] = parseContract(
      z.array(zInvoice),
      [invoice],
      'BillingInvoices.addInvoice',
    );
    this.invoices.push(clone(checked));

    return clone(checked);
  }

  /** Whether an invoice of this kind already bills the period that starts at `boundaryAt`. */
  hasBoundary(
    instanceSlug: string,
    kind: Invoice['kind'],
    boundaryAt: string,
  ): boolean {
    return this.invoices.some(
      (invoice) =>
        invoice.instanceSlug === instanceSlug &&
        invoice.kind === kind &&
        Date.parse(invoice.boundaryAt) === Date.parse(boundaryAt),
    );
  }

  private consume(operation: InvoiceProblemOperation) {
    const problem = this.armed.get(operation);
    if (!problem) {
      return;
    }
    if ((problem.after ?? 0) > 0) {
      this.armed.set(operation, {
        ...problem,
        after: (problem.after ?? 0) - 1,
      });

      return;
    }
    this.armed.delete(operation);
    if (problem.concurrently) {
      this.settle(problem.concurrently.invoiceId, problem.concurrently.status);
    }
    throw new BillingProblem(problem.status, problem.code, problem.detail, {
      errorId: problem.errorId,
      errors: problem.errors,
      retryAfterSeconds: problem.retryAfterSeconds,
    });
  }

  /** Someone else took an invoice to a status: the same fields an action of the page would set. */
  private settle(id: string, status: 'PAID' | 'UNCOLLECTIBLE' | 'VOID') {
    const invoice = this.invoices.find((candidate) => candidate.id === id);
    if (!invoice) {
      return;
    }
    const at = new Date(this.now()).toISOString();
    invoice.status = status;
    if (status === 'PAID') {
      invoice.paidAt = at;
    } else if (status === 'UNCOLLECTIBLE') {
      invoice.uncollectibleAt = at;
    } else {
      invoice.voidedAt = at;
      invoice.voidReason = 'voided by someone else';
    }
    this.stamp(invoice);
  }

  private find(id: string, notFoundCode: string): Invoice {
    const invoice = this.invoices.find((candidate) => candidate.id === id);
    if (!invoice) {
      throw new BillingProblem(404, notFoundCode, `invoice ${id} not found`);
    }

    return invoice;
  }

  private stamp(invoice: Invoice): Invoice {
    invoice.updatedAt = new Date(this.now()).toISOString();

    return invoice;
  }

  /** Every invoice, for a spec that asserts what the model holds. */
  snapshot(): Invoice[] {
    return clone(this.invoices);
  }

  /** The invoices a list would select, without the list's armed refusals: what the health counts. */
  matching(query: InvoiceListQuery): Invoice[] {
    return this.invoices.filter((invoice) => this.matches(invoice, query));
  }

  /** Whether an invoice waits in the push queue: the next read of it lets the job run. */
  hasQueuedPush(id: string): boolean {
    return this.pushQueue.has(id);
  }

  /** What the payment provider now says of an invoice: a customer paid it, or someone finalized or deleted it there. */
  setProviderTruth(id: string, truth: ProviderTruth) {
    this.providerTruth.set(id, truth);
  }

  // --- Reads ----------------------------------------------------------------

  private matches(invoice: Invoice, query: InvoiceListQuery): boolean {
    const now = this.now();
    const at = (instant: string | undefined) =>
      instant === undefined ? Number.NaN : Date.parse(instant);

    if (query.status?.length && !query.status.includes(invoice.status)) {
      return false;
    }
    if (query.kind && invoice.kind !== query.kind) {
      return false;
    }
    if (query.providerKind && invoice.providerKind !== query.providerKind) {
      return false;
    }
    if (query.customerSlug && invoice.customerSlug !== query.customerSlug) {
      return false;
    }
    if (query.instanceSlug && invoice.instanceSlug !== query.instanceSlug) {
      return false;
    }
    if (query.handoffStatus && invoice.handoffStatus !== query.handoffStatus) {
      return false;
    }
    if (
      query.overdue &&
      !(
        ['MANUAL', 'PUSHED', 'PAYMENT_FAILED'].includes(invoice.status) &&
        at(invoice.dueAt) < now
      )
    ) {
      return false;
    }
    if (query.held && !(invoice.status === 'DRAFT' && invoice.holdReason)) {
      return false;
    }
    const inside = (
      value: number,
      from: string | undefined,
      to: string | undefined,
    ) =>
      (from === undefined || value >= Date.parse(from)) &&
      (to === undefined || value < Date.parse(to));
    if (
      (query.issuedFrom || query.issuedTo) &&
      !(
        invoice.issuedAt &&
        inside(at(invoice.issuedAt), query.issuedFrom, query.issuedTo)
      )
    ) {
      return false;
    }

    return inside(
      Date.parse(invoice.boundaryAt),
      query.boundaryFrom,
      query.boundaryTo,
    );
  }

  private checkRange(
    operation: string,
    name: string,
    from: string | undefined,
    to: string | undefined,
  ) {
    if (from && to && Date.parse(from) >= Date.parse(to)) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidFilter`,
        `${name}From must be before ${name}To`,
      );
    }
  }

  private filter(operation: string, query: InvoiceListQuery): Invoice[] {
    this.checkRange(operation, 'issued', query.issuedFrom, query.issuedTo);
    this.checkRange(
      operation,
      'boundary',
      query.boundaryFrom,
      query.boundaryTo,
    );

    return this.invoices
      .filter((invoice) => this.matches(invoice, query))
      .sort(byNewest);
  }

  /** `GET /invoices`: newest first, a cursor per page. */
  listInvoices(query: InvoiceListQuery): PageInvoiceSummary {
    this.consume('listInvoices');
    const rows = this.filter('ListInvoices', query);
    const limit = Math.min(
      query.limit && query.limit > 0 ? query.limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    let start = 0;
    if (query.cursor) {
      const key = decodeCursor(query.cursor, 'Invoices.InvalidCursor');
      const position = rows.findIndex(
        (invoice) => invoice.id === key.id && invoice.createdAt === key.at,
      );
      start = position === -1 ? rows.length : position + 1;
    }
    const page = rows.slice(start, start + limit);
    const last = page.at(-1);
    const hasMore = start + limit < rows.length && last !== undefined;

    return {
      hasMore,
      items: page.map(toSummary),
      nextCursor: hasMore
        ? encodeCursor({ at: last.createdAt, id: last.id })
        : undefined,
    };
  }

  /** `GET /invoices/{invoiceId}`. */
  getInvoice(id: string): Invoice {
    this.consume('getInvoice');
    const invoice = this.find(id, 'GetInvoice.NotFound');
    this.runQueuedPush(invoice);

    return clone(invoice);
  }

  /** `GET /billing/handoff`: oldest issue first, one status at a time. */
  listHandoff(
    status: string | null,
    cursor: string | null,
    limit: number | null,
  ): PageQueuedInvoice {
    this.consume('listHandoff');
    const wanted = status || 'PENDING';
    if (wanted !== 'PENDING' && wanted !== 'ACKNOWLEDGED') {
      throw new BillingProblem(
        422,
        'ListHandoff.InvalidStatus',
        'status is PENDING or ACKNOWLEDGED',
      );
    }
    const rows = this.invoices
      .filter((invoice) => invoice.handoffStatus === wanted)
      .sort(byOldestIssue);
    const size = Math.min(
      limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    let start = 0;
    if (cursor) {
      const key = decodeCursor(cursor, 'Handoff.InvalidCursor');
      const position = rows.findIndex((invoice) => invoice.id === key.id);
      start = position === -1 ? rows.length : position + 1;
    }
    const page = rows.slice(start, start + size);
    const last = page.at(-1);
    const hasMore = start + size < rows.length && last !== undefined;

    return {
      hasMore,
      items: page.map((invoice): QueuedInvoice => ({
        ...toSummary(invoice),
        handoff: clone(invoice.handoff),
      })),
      nextCursor: hasMore
        ? encodeCursor({ at: last.issuedAt ?? last.createdAt, id: last.id })
        : undefined,
    };
  }

  /** `GET /invoices/{invoiceId}/lines/{lineId}/reports`, as a page. */
  listLineReports(
    invoiceId: string,
    lineId: string,
    afterSeq: number,
    limit: number | null,
  ): LineReportPage {
    const rows = this.reportsOf(invoiceId, lineId);
    const size = Math.min(
      limit && limit > 0 ? limit : DEFAULT_REPORTS_PAGE_SIZE,
      MAX_REPORTS_PAGE_SIZE,
    );
    const remaining = rows.filter((row) => row.reportSeq > afterSeq);
    const page = remaining.slice(0, size);
    const last = page.at(-1);

    return {
      items: clone(page),
      nextAfterSeq:
        remaining.length > size && last !== undefined
          ? last.reportSeq
          : undefined,
    };
  }

  /** The same reports as a CSV, every one of them. */
  exportLineReports(invoiceId: string, lineId: string): ExportedFile {
    const rows = this.reportsOf(invoiceId, lineId);

    return {
      body: `${[
        csvRow(REPORT_COLUMNS),
        ...rows.map((row) =>
          csvRow([
            row.reportSeq,
            row.reportedAt,
            row.behavior,
            row.aggregationMethod,
            row.reportedValue,
            row.valueBefore,
            row.valueAfter,
            row.delta,
            row.overageDelta,
            row.eventCountAfter,
            row.windowStart,
            row.windowEnd,
            row.limitValue,
            row.overagePercent,
            row.licenseId,
            row.transactionId,
          ]),
        ),
      ].join('\n')}\n`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  private reportsOf(invoiceId: string, lineId: string): UsageReport[] {
    this.consume('listLineReports');
    // An unknown invoice and an unknown line of a known invoice are two refusals.
    const invoice = this.find(invoiceId, 'ListInvoiceLineReports.NotFound');
    const line = invoice.lines.find((candidate) => candidate.id === lineId);
    if (!line) {
      throw new BillingProblem(
        404,
        'ListInvoiceLineReports.LineNotFound',
        `invoice ${invoiceId} has no line ${lineId}`,
      );
    }
    if (!line.entitlementId || !line.metering) {
      throw new BillingProblem(
        422,
        'ListInvoiceLineReports.NotMetered',
        'only a USAGE or OVERAGE line has usage reports',
      );
    }
    if (
      this.retentionStart &&
      Date.parse(line.serviceFrom) < Date.parse(this.retentionStart)
    ) {
      throw new BillingProblem(
        422,
        'ListInvoiceLineReports.OutsideRetention',
        "the line's period starts before the organization's usage history: its reports are gone, its metering remains",
        {
          errors: [
            {
              location: 'metering',
              message: "the line's metering",
              value: line.metering,
            },
          ],
        },
      );
    }

    return this.reports.get(lineId) ?? [];
  }

  /** `GET /invoices/export`: the invoices the filters select, as a file. */
  exportInvoices(
    query: InvoiceListQuery,
    format: string | null,
    granularity: string | null,
  ): ExportedFile {
    this.consume('exportInvoices');
    const wantedFormat = format || 'csv';
    if (wantedFormat !== 'csv' && wantedFormat !== 'json') {
      throw new BillingProblem(
        422,
        'ExportInvoices.InvalidFormat',
        'format is csv or json',
      );
    }
    const wantedGranularity = granularity || 'line';
    if (wantedGranularity !== 'line' && wantedGranularity !== 'invoice') {
      throw new BillingProblem(
        422,
        'ExportInvoices.InvalidGranularity',
        'granularity is line or invoice',
      );
    }
    // The export pages by itself: it takes neither a cursor nor a limit.
    const invoices = this.filter('ExportInvoices', {
      ...query,
      cursor: undefined,
      limit: undefined,
    });
    if (wantedFormat === 'json') {
      return {
        body: invoices.map((invoice) => JSON.stringify(invoice)).join('\n'),
        contentType: 'application/x-ndjson',
      };
    }
    const withLines = wantedGranularity === 'line';
    const header = [
      ...INVOICE_COLUMNS,
      ...(withLines ? LINE_COLUMNS : []),
      ...TOTAL_COLUMNS,
    ];
    const rows = invoices.flatMap((invoice) => {
      const invoiceCells = [
        invoice.id,
        invoice.kind,
        invoice.boundaryAt,
        invoice.status,
        invoice.providerKind,
        invoice.customerSlug,
        invoice.customerName,
        invoice.instanceSlug,
        invoice.licenseSlug,
        invoice.billingEmail,
        invoice.currency,
        CURRENCY_EXPONENTS.get(invoice.currency) ?? 2,
        invoice.issuedAt,
        invoice.dueAt,
        invoice.serviceFrom,
        invoice.serviceTo,
      ];
      const totalCells = [
        invoice.subtotal,
        invoice.discountTotal,
        invoice.total,
        invoice.handoff.externalReference,
        invoice.handoffStatus,
      ];
      if (!withLines) {
        return [csvRow([...invoiceCells, ...totalCells])];
      }

      return invoice.lines.map((line) =>
        csvRow([
          ...invoiceCells,
          line.seq,
          line.type,
          line.label,
          line.description,
          line.quantity,
          line.unitAmountDecimal,
          line.amount,
          line.serviceFrom,
          line.serviceTo,
          line.entitlementSlug,
          '',
          ...totalCells,
        ]),
      );
    });

    return {
      body: `${[csvRow(header), ...rows].join('\n')}\n`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  // --- Actions --------------------------------------------------------------

  private checkReason(operation: string, reason: string | undefined) {
    const length = runeCount(reason ?? '');
    if (length === 0 || length > MAX_REASON) {
      throw new BillingProblem(
        422,
        `${operation}.ReasonRequired`,
        'a reason of 1 to 500 characters is required',
      );
    }
  }

  private checkReference(operation: string, reference: string | undefined) {
    if (reference === undefined) {
      return;
    }
    const length = runeCount(reference);
    if (length === 0 || length > MAX_EXTERNAL_REFERENCE) {
      throw new BillingProblem(
        422,
        `${operation}.InvalidExternalReference`,
        'externalReference is 1 to 255 characters',
      );
    }
  }

  private refuseProviderManaged(operation: string, invoice: Invoice) {
    if (invoice.providerKind !== 'NOOP') {
      throw new BillingProblem(
        409,
        `${operation}.ProviderManaged`,
        'a payment provider collects this invoice: record the payment there',
      );
    }
  }

  /** What issuing a held invoice does: MANUAL and pending, or PAID when nothing is owed. */
  private issue(invoice: Invoice) {
    const at = new Date(this.now()).toISOString();
    if (invoice.providerKind !== 'NOOP') {
      // A Stripe draft enters the push queue: still a DRAFT here.
      return;
    }
    invoice.issuedAt = at;
    invoice.daysUntilDue = this.defaultDaysUntilDue;
    invoice.dueAt = new Date(
      this.now() + this.defaultDaysUntilDue * DAY_MS,
    ).toISOString();
    if (invoice.total === 0) {
      invoice.status = 'PAID';
      invoice.paidAt = at;
      invoice.handoffStatus = 'NOT_REQUIRED';
      invoice.handoff = { claimCount: 0, status: 'NOT_REQUIRED' };

      return;
    }
    invoice.status = 'MANUAL';
    invoice.handoffStatus = 'PENDING';
    invoice.handoff = { claimCount: 0, status: 'PENDING' };
  }

  private clearHold(invoice: Invoice, reason: string, by: string | undefined) {
    const releasedAt = new Date(this.now()).toISOString();
    invoice.hold = {
      heldAt: invoice.hold?.heldAt ?? invoice.createdAt,
      releaseReason: reason,
      releasedAt,
      releasedBy: by,
    };
    invoice.holdReason = undefined;
    invoice.holdDetail = undefined;
  }

  /** `POST /invoices/{invoiceId}/release-hold`. */
  releaseHold(id: string, reason: string | undefined): Invoice {
    this.consume('releaseHold');
    this.checkReason('ReleaseInvoiceHold', reason);
    const invoice = this.find(id, 'ReleaseInvoiceHold.NotFound');
    if (!invoice.holdReason) {
      throw new BillingProblem(
        409,
        'ReleaseInvoiceHold.NotHeld',
        'the invoice is not held',
      );
    }
    this.clearHold(invoice, reason ?? '', ACTOR);
    this.issue(invoice);

    return clone(this.stamp(invoice));
  }

  /**
   * `POST /invoices/{invoiceId}/recompose`: a held DRAFT is rewritten in place
   * (its journal is read as sound now); a VOID invoice gets a replacement.
   */
  recompose(id: string): { invoice: Invoice; replaced: boolean } {
    this.consume('recompose');
    const invoice = this.find(id, 'RecomposeInvoice.NotFound');
    const held = invoice.status === 'DRAFT' && Boolean(invoice.holdReason);
    if (!held && invoice.status !== 'VOID') {
      throw new BillingProblem(
        409,
        'RecomposeInvoice.InvalidStatus',
        'only a held DRAFT or a VOID invoice can be recomposed; void this one first',
      );
    }
    if (this.deleted.has(invoice.instanceSlug)) {
      throw new BillingProblem(
        409,
        'RecomposeInvoice.InstanceDeleted',
        "the invoice's instance was deleted: its usage cannot be measured again",
      );
    }
    if (held) {
      this.clearHold(invoice, 'recomposed', ACTOR);
      this.issue(invoice);

      return { invoice: clone(this.stamp(invoice)), replaced: false };
    }
    if (invoice.replacedByInvoiceId) {
      throw new BillingProblem(
        409,
        'RecomposeInvoice.AlreadyReplaced',
        'this VOID invoice was already recomposed',
        {
          errors: [
            {
              location: 'replacementInvoiceId',
              message: 'the replacement invoice',
              value: { replacementInvoiceId: invoice.replacedByInvoiceId },
            },
          ],
        },
      );
    }
    const at = new Date(this.now()).toISOString();
    const replacementId = `${invoice.id}-replacement-${this.sequence}`;
    this.sequence += 1;
    const replacement: Invoice = {
      ...clone(invoice),
      createdAt: at,
      hold: undefined,
      holdDetail: undefined,
      holdReason: undefined,
      id: replacementId,
      paidAt: undefined,
      // The replacement is a new invoice of the provider: it waits for its push.
      provider:
        invoice.providerKind === 'NOOP'
          ? undefined
          : {
              nextPushAt: at,
              pushAttempts: 0,
            },
      replacedByInvoiceId: undefined,
      replacesInvoiceId: invoice.id,
      status: 'DRAFT',
      uncollectibleAt: undefined,
      updatedAt: at,
      voidReason: undefined,
      voidedAt: undefined,
    };
    this.issue(replacement);
    this.invoices.push(replacement);
    invoice.replacedByInvoiceId = replacementId;
    this.stamp(invoice);

    return { invoice: clone(replacement), replaced: true };
  }

  /** `POST /invoices/{invoiceId}/mark-paid`. */
  markPaid(id: string, body: InvoicePayment): Invoice {
    this.consume('markPaid');
    this.checkReference('MarkInvoicePaid', body.externalReference);
    const invoice = this.find(id, 'MarkInvoicePaid.NotFound');
    this.refuseProviderManaged('MarkInvoicePaid', invoice);
    const stored = invoice.handoff.externalReference;
    if (invoice.status === 'PAID' && stored === body.externalReference) {
      return clone(invoice);
    }
    if (invoice.status !== 'MANUAL') {
      throw new BillingProblem(
        409,
        'MarkInvoicePaid.InvalidStatus',
        `only a MANUAL invoice can be marked paid; this one is ${invoice.status}`,
      );
    }
    if (
      stored !== undefined &&
      body.externalReference !== undefined &&
      stored !== body.externalReference
    ) {
      throw new BillingProblem(
        409,
        'MarkInvoicePaid.ReferenceMismatch',
        'the invoice was handed off under another external reference',
      );
    }
    const now = this.now();
    const paidAt = body.paidAt ? Date.parse(body.paidAt) : now;
    if (paidAt > now) {
      throw new BillingProblem(
        422,
        'MarkInvoicePaid.PaidAtInFuture',
        'paidAt is in the future',
      );
    }
    invoice.status = 'PAID';
    invoice.paidAt = new Date(paidAt).toISOString();
    if (invoice.handoffStatus === 'PENDING') {
      invoice.handoffStatus = 'ACKNOWLEDGED';
      invoice.handoff = {
        acknowledgedAt: new Date(now).toISOString(),
        claimCount: invoice.handoff.claimCount,
        externalReference: body.externalReference,
        status: 'ACKNOWLEDGED',
      };
    } else if (body.externalReference !== undefined) {
      invoice.handoff.externalReference = body.externalReference;
    }

    return clone(this.stamp(invoice));
  }

  /** `POST /invoices/{invoiceId}/write-off`. */
  writeOff(id: string, reason: string | undefined): Invoice {
    this.consume('writeOff');
    this.checkReason('WriteOffInvoice', reason);
    const invoice = this.find(id, 'WriteOffInvoice.NotFound');
    this.refuseProviderManaged('WriteOffInvoice', invoice);
    if (invoice.status === 'UNCOLLECTIBLE') {
      return clone(invoice);
    }
    if (invoice.status !== 'MANUAL') {
      throw new BillingProblem(
        409,
        'WriteOffInvoice.InvalidStatus',
        `only a MANUAL invoice can be written off; this one is ${invoice.status}`,
      );
    }
    invoice.status = 'UNCOLLECTIBLE';
    invoice.uncollectibleAt = new Date(this.now()).toISOString();

    // A handoff still pending stays so: its consumer sees the new status.
    return clone(this.stamp(invoice));
  }

  /**
   * `POST /invoices/{invoiceId}/void`: without a payment provider, local; with
   * one, in the provider first. Kaiten writes VOID only once the provider has
   * voided (or deleted) its invoice, so that it never shows VOID for an invoice the
   * customer can still pay; an invoice the provider reports paid is refused.
   */
  voidInvoice(id: string, reason: string | undefined): Invoice {
    this.consume('voidInvoice');
    this.checkReason('VoidInvoice', reason);
    const invoice = this.find(id, 'VoidInvoice.NotFound');
    if (invoice.status === 'VOID') {
      return clone(invoice);
    }
    const allowed =
      invoice.providerKind === 'NOOP'
        ? ['DRAFT', 'PUSH_FAILED', 'MANUAL']
        : ['DRAFT', 'PUSH_FAILED', 'PUSHED', 'PAYMENT_FAILED'];
    if (!allowed.includes(invoice.status)) {
      throw new BillingProblem(
        409,
        'VoidInvoice.InvalidStatus',
        `a ${invoice.status} invoice cannot be voided`,
      );
    }
    this.voidInProvider(invoice);
    invoice.status = 'VOID';
    invoice.voidedAt = new Date(this.now()).toISOString();
    invoice.voidReason = reason;
    invoice.provider = invoice.provider && {
      ...invoice.provider,
      nextPushAt: undefined,
    };
    this.pushQueue.delete(id);

    return clone(this.stamp(invoice));
  }

  /** The provider's leg of a void: a draft is deleted there, an open invoice voided. */
  private voidInProvider(invoice: Invoice) {
    const record = invoice.provider;
    if (invoice.providerKind === 'NOOP' || !record?.externalInvoiceId) {
      return;
    }
    const truth = this.truthOf(invoice);
    if (truth === 'paid') {
      throw new BillingProblem(
        409,
        'VoidInvoice.InvalidStatus',
        'the payment provider reports this invoice paid',
        {
          errors: [
            {
              location: 'provider',
              message: 'paid at the provider',
              value: 'paid_at_provider',
            },
          ],
        },
      );
    }
    record.status = record.status === 'draft' ? undefined : 'void';
    this.providerTruth.set(invoice.id, 'void');
  }

  /** What the provider says of an invoice: what a spec set, else what Kaiten last read. */
  private truthOf(invoice: Invoice): ProviderTruth {
    return (
      this.providerTruth.get(invoice.id) ?? invoice.provider?.status ?? 'open'
    );
  }

  // --- The payment provider ----------------------------------------------------------

  /**
   * An invoice the provider has accepted: the same fields the push sets when it
   * finalizes a Stripe invoice, reconciled against Kaiten's total.
   */
  private finalizeAtProvider(invoice: Invoice) {
    const at = new Date(this.now()).toISOString();
    const record = (invoice.provider ??= { pushAttempts: 0 });
    const days =
      invoice.collectionMethod === 'CHARGE_AUTOMATICALLY'
        ? 0
        : (invoice.daysUntilDue ?? this.defaultDaysUntilDue);
    const externalId = record.externalInvoiceId ?? `in_${invoice.id}`;

    invoice.status = 'PUSHED';
    invoice.issuedAt = at;
    invoice.daysUntilDue = days;
    invoice.dueAt = new Date(this.now() + days * DAY_MS).toISOString();
    record.externalInvoiceId = externalId;
    record.invoiceNumber ??= `INV-${externalId.slice(-6).toUpperCase()}`;
    record.status = 'open';
    record.hostedInvoiceUrl = `https://invoice.stripe.com/i/acct_1/${externalId}`;
    record.invoicePdfUrl = `https://pay.stripe.com/invoice/acct_1/${externalId}/pdf`;
    record.pushedAt = at;
    record.syncedAt = at;
    record.nextPushAt = undefined;
    record.lastPushError = undefined;
    record.totalExcludingTax = invoice.total;
    record.reconciliationStatus = 'MATCHED';
    record.reconciliationDetail = undefined;
    record.reconciledAt = at;
    this.providerTruth.set(invoice.id, 'open');
  }

  /** The job of the push queue, run for an invoice that was queued and has been read enough times since. */
  private runQueuedPush(invoice: Invoice) {
    const left = this.pushQueue.get(invoice.id);
    if (left === undefined || this.stalledPushes.has(invoice.id)) {
      return;
    }
    if (left > 1) {
      this.pushQueue.set(invoice.id, left - 1);

      return;
    }
    this.pushQueue.delete(invoice.id);
    if (!['DRAFT', 'PUSH_FAILED'].includes(invoice.status)) {
      return;
    }
    const failure = this.pushFailures.get(invoice.id);
    if (failure) {
      const record = (invoice.provider ??= { pushAttempts: 0 });
      record.pushAttempts += 1;
      record.lastPushError = failure;
      record.nextPushAt = new Date(
        this.now() + 2 ** record.pushAttempts * 60_000,
      ).toISOString();
      invoice.status = 'PUSH_FAILED';
      this.stamp(invoice);

      return;
    }
    this.finalizeAtProvider(invoice);
    this.stamp(invoice);
  }

  /**
   * `POST /invoices/{invoiceId}/retry-push`: puts a DRAFT or PUSH_FAILED invoice
   * of a payment provider back in the push queue now. A draft waiting for its
   * finalization in the provider (review mode) is finalized at once instead.
   */
  retryPush(id: string): Invoice {
    this.consume('retryPush');
    const invoice = this.find(id, 'RetryInvoicePush.NotFound');
    if (
      invoice.providerKind === 'NOOP' ||
      !['DRAFT', 'PUSH_FAILED'].includes(invoice.status)
    ) {
      throw new BillingProblem(
        409,
        'RetryInvoicePush.InvalidStatus',
        "only a payment provider's DRAFT or PUSH_FAILED invoice is pushed",
      );
    }
    if (invoice.holdReason) {
      throw new BillingProblem(
        409,
        'RetryInvoicePush.Held',
        'a held invoice is released or recomposed before it is pushed',
      );
    }
    const record = invoice.provider;
    const awaitsFinalization =
      invoice.status === 'DRAFT' &&
      record?.externalInvoiceId !== undefined &&
      record.nextPushAt === undefined;
    if (awaitsFinalization) {
      this.finalizeAtProvider(invoice);
    } else {
      invoice.provider = {
        pushAttempts: 0,
        ...record,
        nextPushAt: new Date(this.now()).toISOString(),
      };
      this.pushQueue.set(id, PUSH_JOB_AFTER_READS);
    }

    return clone(this.stamp(invoice));
  }

  /** Applies what the provider says of an invoice to Kaiten's copy of it. */
  private applyProviderTruth(invoice: Invoice) {
    const record = invoice.provider;
    if (!record?.externalInvoiceId) {
      return;
    }
    const at = new Date(this.now()).toISOString();
    const truth = this.truthOf(invoice);

    record.syncedAt = at;
    switch (truth) {
      case 'paid':
        invoice.status = 'PAID';
        invoice.paidAt = at;
        record.status = 'paid';
        record.nextPushAt = undefined;
        break;
      case 'void':
      case 'deleted':
        invoice.status = 'VOID';
        invoice.voidedAt = at;
        invoice.voidReason =
          truth === 'void' ? 'voided_in_provider' : 'provider_draft_deleted';
        record.status = truth === 'void' ? 'void' : undefined;
        record.nextPushAt = undefined;
        break;
      case 'uncollectible':
        invoice.status = 'UNCOLLECTIBLE';
        invoice.uncollectibleAt = at;
        record.status = 'uncollectible';
        break;
      case 'open':
        // Finalized outside Kaiten: the step-three persistence of the push.
        if (['DRAFT', 'PUSH_FAILED'].includes(invoice.status)) {
          this.finalizeAtProvider(invoice);
        } else {
          record.status = 'open';
        }
        break;
      case 'draft':
        record.status = 'draft';
        break;
    }
    this.pushQueue.delete(invoice.id);
    this.stamp(invoice);
  }

  /**
   * `POST /invoices/{invoiceId}/sync`: reads an invoice from its payment provider
   * now and applies what the provider says: its finalization, payment, write-off
   * or void.
   */
  syncInvoice(id: string): Invoice {
    this.consume('syncInvoice');
    const invoice = this.find(id, 'SyncInvoice.NotFound');
    if (
      invoice.providerKind === 'NOOP' ||
      !invoice.provider?.externalInvoiceId
    ) {
      throw new BillingProblem(
        409,
        'SyncInvoice.NotPushed',
        'the invoice is not in a payment provider',
      );
    }
    this.applyProviderTruth(invoice);

    return clone(invoice);
  }

  /**
   * The pass of the provider, over every invoice it holds that is not settled:
   * what the periodic pass and `POST /billing/sync` do. It says how many it read.
   */
  syncOpenProviderInvoices(): { applied: number; failed: number } {
    let applied = 0;
    for (const invoice of this.invoices) {
      if (
        invoice.providerKind !== 'NOOP' &&
        invoice.provider?.externalInvoiceId &&
        ['DRAFT', 'PUSH_FAILED', 'PUSHED', 'PAYMENT_FAILED'].includes(
          invoice.status,
        )
      ) {
        this.applyProviderTruth(invoice);
        applied += 1;
      }
    }

    return { applied, failed: 0 };
  }

  /** `POST /billing/handoff/{invoiceId}/ack`. */
  ackHandoff(id: string, body: HandoffBooking): Invoice {
    this.consume('ackHandoff');
    this.checkReference('AckHandoff', body.externalReference);
    const invoice = this.find(id, 'AckHandoff.NotFound');
    const stored = invoice.handoff.externalReference;
    if (invoice.handoffStatus === 'NOT_REQUIRED') {
      throw new BillingProblem(
        409,
        'AckHandoff.NotRequired',
        'this invoice is not in the handoff queue',
      );
    }
    if (invoice.handoffStatus === 'ACKNOWLEDGED') {
      if (body.externalReference === undefined) {
        return clone(invoice);
      }
      if (stored === undefined) {
        invoice.handoff.externalReference = body.externalReference;

        return clone(this.stamp(invoice));
      }
      if (stored !== body.externalReference) {
        throw new BillingProblem(
          409,
          'AckHandoff.ReferenceMismatch',
          'the invoice was already acknowledged under another reference',
        );
      }

      return clone(invoice);
    }
    if (
      body.leaseId !== undefined &&
      (invoice.handoff.leaseId === undefined ||
        invoice.handoff.leaseId !== body.leaseId)
    ) {
      throw new BillingProblem(
        409,
        'AckHandoff.LeaseMismatch',
        "the invoice's lease expired and another claim took it",
      );
    }
    invoice.handoffStatus = 'ACKNOWLEDGED';
    invoice.handoff = {
      acknowledgedAt: new Date(this.now()).toISOString(),
      claimCount: invoice.handoff.claimCount,
      externalReference: body.externalReference,
      status: 'ACKNOWLEDGED',
    };

    return clone(this.stamp(invoice));
  }
}
