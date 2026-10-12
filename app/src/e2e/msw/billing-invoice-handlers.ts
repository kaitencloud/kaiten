import { HttpResponse } from 'msw/http';
import {
  handleAckHandoff,
  handleExportInvoices,
  handleGetInvoice,
  handleListHandoff,
  handleListInvoiceLineReports,
  handleListInvoices,
  handleMarkInvoicePaid,
  handleRecomposeInvoice,
  handleReleaseInvoiceHold,
  handleRetryInvoicePush,
  handleSyncInvoice,
  handleVoidInvoice,
  handleWriteOffInvoice,
} from '@/api-client/msw.gen';
import type { InvoiceListQuery } from '../../../e2e/app/_support/model/billing-invoices';
import type { BillingAppModel } from '../../../e2e/app/_support/model/billing-app-model';
import { withProblems } from './billing-problems';
import { noop, type PersistMswState } from './persistence';

const instantOrUndefined = (value: string | null) => value ?? undefined;

/**
 * The filters of `GET /invoices` and of its export, read from the URL as the
 * API reads them: `status` repeats, a boolean is the word `true`.
 */
export function readInvoiceListQuery(url: URL): InvoiceListQuery {
  const params = url.searchParams;
  const limit = params.get('limit');
  const status = params.getAll('status');

  return {
    boundaryFrom: instantOrUndefined(params.get('boundaryFrom')),
    boundaryTo: instantOrUndefined(params.get('boundaryTo')),
    cursor: instantOrUndefined(params.get('cursor')),
    customerSlug: instantOrUndefined(params.get('customerSlug')),
    handoffStatus: instantOrUndefined(params.get('handoffStatus')),
    held: params.get('held') === 'true',
    instanceSlug: instantOrUndefined(params.get('instanceSlug')),
    issuedFrom: instantOrUndefined(params.get('issuedFrom')),
    issuedTo: instantOrUndefined(params.get('issuedTo')),
    kind: instantOrUndefined(params.get('kind')),
    limit: limit === null ? undefined : Number(limit),
    overdue: params.get('overdue') === 'true',
    providerKind: instantOrUndefined(params.get('providerKind')),
    status: status.length > 0 ? status : undefined,
  };
}

const numberOrNull = (value: string | null) =>
  value === null ? null : Number(value);

/**
 * The invoices of the organization and their handoff queue: the list and its
 * export, one invoice with the usage behind its metered lines, the actions on
 * an invoice and the manual acknowledgement of a handed-off one. Each answers
 * as the API does, with the refusals of the status the invoice is in.
 *
 * An export answers with no `Content-Disposition`: the CORS policy of the local
 * stack does not expose it, so the console cannot read the file name from a
 * browser and names the file itself.
 */
export const billingInvoiceHandlers = (
  model: BillingAppModel,
  persist: PersistMswState = noop,
) => {
  const { invoices } = model;
  const file = ({ body, contentType }: { body: string; contentType: string }) =>
    new HttpResponse(body, { headers: { 'Content-Type': contentType } });

  return [
    handleListInvoices(
      withProblems(({ request }) =>
        HttpResponse.json(
          invoices.listInvoices(readInvoiceListQuery(new URL(request.url))),
        ),
      ),
    ),
    // Registered before `/invoices/{invoiceId}`: `export` is no invoice id.
    handleExportInvoices(
      withProblems(({ request }) => {
        const url = new URL(request.url);

        return file(
          invoices.exportInvoices(
            readInvoiceListQuery(url),
            url.searchParams.get('format'),
            url.searchParams.get('granularity'),
          ),
        );
      }),
    ),
    handleGetInvoice(
      withProblems(({ params }) => {
        const queued = invoices.hasQueuedPush(params.invoiceId);
        const invoice = invoices.getInvoice(params.invoiceId);
        // Reading an invoice that waits in the push queue is what lets its job run.
        if (queued) {
          persist();
        }
        return HttpResponse.json(invoice);
      }),
    ),
    handleListInvoiceLineReports(
      withProblems(({ params, request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('format') === 'csv') {
          return file(
            invoices.exportLineReports(params.invoiceId, params.lineId),
          );
        }

        return HttpResponse.json(
          invoices.listLineReports(
            params.invoiceId,
            params.lineId,
            Number(url.searchParams.get('afterSeq') ?? 0),
            numberOrNull(url.searchParams.get('limit')),
          ),
        );
      }),
    ),
    handleReleaseInvoiceHold(
      withProblems(async ({ params, request }) => {
        const body = await request.json();
        const invoice = invoices.releaseHold(params.invoiceId, body?.reason);
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
    handleRecomposeInvoice(
      withProblems(({ params }) => {
        const { invoice, replaced } = invoices.recompose(params.invoiceId);
        persist();
        return HttpResponse.json(invoice, { status: replaced ? 201 : 200 });
      }),
    ),
    handleMarkInvoicePaid(
      withProblems(async ({ params, request }) => {
        const invoice = invoices.markPaid(
          params.invoiceId,
          (await request.json()) ?? {},
        );
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
    handleWriteOffInvoice(
      withProblems(async ({ params, request }) => {
        const body = await request.json();
        const invoice = invoices.writeOff(params.invoiceId, body?.reason);
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
    handleVoidInvoice(
      withProblems(async ({ params, request }) => {
        const body = await request.json();
        const invoice = invoices.voidInvoice(params.invoiceId, body?.reason);
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
    handleRetryInvoicePush(
      withProblems(({ params }) => {
        const invoice = invoices.retryPush(params.invoiceId);
        persist();
        return HttpResponse.json(invoice, { status: 202 });
      }),
    ),
    handleSyncInvoice(
      withProblems(({ params }) => {
        const invoice = invoices.syncInvoice(params.invoiceId);
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
    handleListHandoff(
      withProblems(({ request }) => {
        const params = new URL(request.url).searchParams;

        return HttpResponse.json(
          invoices.listHandoff(
            params.get('status'),
            params.get('cursor'),
            numberOrNull(params.get('limit')),
          ),
        );
      }),
    ),
    handleAckHandoff(
      withProblems(async ({ params, request }) => {
        const invoice = invoices.ackHandoff(
          params.invoiceId,
          (await request.json()) ?? {},
        );
        persist();
        return HttpResponse.json(invoice);
      }),
    ),
  ];
};
