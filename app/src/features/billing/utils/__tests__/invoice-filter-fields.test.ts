import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  applyFilterModel,
  FILTER_MULTI_SELECT_SEPARATOR,
  type FilterFieldDefinition,
  type FilterModel,
} from '@/functionals/filters';
import { invoiceRow, queuedRow } from '@/test-fixtures/billing-test-support';
import {
  createHandoffFilterFields,
  createInvoicesFilterFields,
  getInvoiceSearchTokens,
  INVOICE_FILTER_IDS,
  type FilterableInvoice,
} from '../invoice-filter-fields';

// A key stands for its text: the fields are checked by what they select.
const t = ((key: string) => key) as TFunction;

const fields = createInvoicesFilterFields({ showProvider: true, t });

/** The invoices the fields select when the given filters are set, by id. */
function select(
  rows: FilterableInvoice[],
  values: Record<string, string>,
  among: FilterFieldDefinition<FilterableInvoice>[] = fields,
): string[] {
  const model: FilterModel = {
    advanced: { combinator: 'and', rules: [] },
    normal: { activeFilterIds: Object.keys(values), values },
  };

  return applyFilterModel(rows, among, model).map((row) => row.id);
}

const select2 = (values: string[]) => values.join(FILTER_MULTI_SELECT_SEPARATOR);

describe('the fields of the list of invoices', () => {
  it('lead with the search, then what the Filter menu offers, and leave the provider to where Stripe is', () => {
    expect(fields.map((field) => field.id)).toEqual([
      'query',
      'status',
      'kind',
      'handoff',
      'provider',
      'overdue',
      'held',
      'issued',
      'servicePeriod',
    ]);
    expect(
      createInvoicesFilterFields({ showProvider: false, t }).map((field) => field.id),
    ).not.toContain('provider');
  });

  it('say how each one is picked: the statuses together, a kind or a handoff alone, a yes or no, a day', () => {
    const typeOf = (id: string) => fields.find((field) => field.id === id)?.type;

    expect(typeOf(INVOICE_FILTER_IDS.search)).toBe('text');
    expect(typeOf(INVOICE_FILTER_IDS.status)).toBe('enum_list');
    expect(typeOf(INVOICE_FILTER_IDS.kind)).toBe('enum');
    expect(typeOf(INVOICE_FILTER_IDS.handoff)).toBe('enum');
    expect(typeOf(INVOICE_FILTER_IDS.provider)).toBe('enum');
    expect(typeOf(INVOICE_FILTER_IDS.overdue)).toBe('boolean');
    expect(typeOf(INVOICE_FILTER_IDS.held)).toBe('boolean');
    expect(typeOf(INVOICE_FILTER_IDS.issued)).toBe('date');
    expect(typeOf(INVOICE_FILTER_IDS.servicePeriod)).toBe('date');
  });

  it('offer every status, kind, handoff status and provider the contract has, in words', () => {
    const labels = (id: string) =>
      fields.find((field) => field.id === id)?.options?.map((option) => option.value);

    expect(labels('status')).toEqual([
      'DRAFT',
      'MANUAL',
      'PUSHED',
      'PAID',
      'PUSH_FAILED',
      'PAYMENT_FAILED',
      'UNCOLLECTIBLE',
      'VOID',
    ]);
    expect(labels('kind')).toEqual(['ACTIVATION', 'RENEWAL', 'FINAL']);
    expect(labels('handoff')).toEqual(['PENDING', 'ACKNOWLEDGED', 'NOT_REQUIRED']);
    expect(labels('provider')).toEqual(['NOOP', 'STRIPE']);
    expect(
      fields.find((field) => field.id === 'status')?.options?.[1].label,
    ).toBe('Features.Billing.InvoiceStatus.MANUAL');
  });

  describe('the search', () => {
    const rows = [
      invoiceRow('inv-1', 'Initech', { instanceName: 'Initech Prod', instanceSlug: 'initech-prod' }),
      invoiceRow('inv-2', 'Globex', { customerSlug: 'globex-corp', instanceName: 'Staging', instanceSlug: 'globex-staging' }),
      invoiceRow('9f2c-7d41', 'Acme'),
    ];

    it.each([
      ['a part of the name of a customer, in any case', 'INITE', ['inv-1']],
      ['the slug of a customer', 'globex-corp', ['inv-2']],
      ['the name of an instance', 'staging', ['inv-2']],
      ['the slug of an instance', 'initech-prod', ['inv-1']],
      ['the identifier of the invoice', '7d41', ['9f2c-7d41']],
    ])('matches %s', (_, typed, expected) => {
      expect(select(rows, { [INVOICE_FILTER_IDS.search]: typed })).toEqual(expected);
    });

    it('matches nothing a customer, an instance and an invoice do not say', () => {
      expect(select(rows, { [INVOICE_FILTER_IDS.search]: 'nobody' })).toEqual([]);
    });

    it('lists the tokens it reads, with the number the accounting system booked an invoice under', () => {
      expect(getInvoiceSearchTokens(invoiceRow('inv-1', 'Initech'))).toEqual([
        'Initech',
        'initech',
        'Initech Production',
        'initech-production',
        'inv-1',
        '',
      ]);
      expect(
        getInvoiceSearchTokens(
          queuedRow('inv-2', 'Globex', {
            handoff: { claimCount: 1, externalReference: 'ERP-4411', status: 'ACKNOWLEDGED' },
          }),
        ).at(-1),
      ).toBe('ERP-4411');
    });
  });

  it('select the statuses picked together, whatever the others are', () => {
    const rows = [
      invoiceRow('paid', 'A', { status: 'PAID' }),
      invoiceRow('manual', 'A', { status: 'MANUAL' }),
      invoiceRow('void', 'A', { status: 'VOID' }),
    ];

    expect(select(rows, { status: select2(['PAID', 'MANUAL']) })).toEqual([
      'paid',
      'manual',
    ]);
    expect(select(rows, { status: 'VOID' })).toEqual(['void']);
  });

  it('select a kind, a handoff status and a provider each by its own field', () => {
    const rows = [
      invoiceRow('a', 'A', { handoffStatus: 'PENDING', kind: 'RENEWAL', providerKind: 'NOOP' }),
      invoiceRow('b', 'A', { handoffStatus: 'ACKNOWLEDGED', kind: 'ACTIVATION', providerKind: 'STRIPE' }),
    ];

    expect(select(rows, { kind: 'ACTIVATION' })).toEqual(['b']);
    expect(select(rows, { handoff: 'PENDING' })).toEqual(['a']);
    expect(select(rows, { provider: 'STRIPE' })).toEqual(['b']);
  });

  it('select the invoices past their due date as the status badge says them, and the others for "no"', () => {
    const rows = [
      invoiceRow('late', 'A', { dueAt: '2020-01-01T00:00:00.000Z', status: 'MANUAL' }),
      invoiceRow('not-yet', 'A', { dueAt: '2099-01-01T00:00:00.000Z', status: 'MANUAL' }),
      invoiceRow('paid', 'A', { dueAt: '2020-01-01T00:00:00.000Z', status: 'PAID' }),
      // What a provider collects past its due date is the provider's: not overdue.
      invoiceRow('charged', 'A', {
        collectionMethod: 'CHARGE_AUTOMATICALLY',
        dueAt: '2020-01-01T00:00:00.000Z',
        status: 'PUSHED',
      }),
    ];

    expect(select(rows, { overdue: 'true' })).toEqual(['late']);
    expect(select(rows, { overdue: 'false' })).toEqual(['not-yet', 'paid', 'charged']);
  });

  it('select the drafts held for their usage journal', () => {
    const rows = [
      invoiceRow('held', 'A', { holdReason: 'LEDGER_SEQUENCE_GAP', status: 'DRAFT' }),
      invoiceRow('draft', 'A', { status: 'DRAFT' }),
    ];

    expect(select(rows, { held: 'true' })).toEqual(['held']);
    expect(select(rows, { held: 'false' })).toEqual(['draft']);
  });

  it('select the invoices issued on a UTC day, whatever the time of day, and never one that was not issued', () => {
    const rows = [
      invoiceRow('morning', 'A', { issuedAt: '2027-03-01T00:00:00.000Z' }),
      invoiceRow('late', 'A', { issuedAt: '2027-03-01T23:59:59.000Z' }),
      invoiceRow('next', 'A', { issuedAt: '2027-03-02T00:00:00.000Z' }),
      invoiceRow('draft', 'A', { issuedAt: undefined, status: 'DRAFT' }),
    ];

    expect(select(rows, { issued: '2027-03-01' })).toEqual(['morning', 'late']);
    expect(select(rows, { issued: '2027-03-02' })).toEqual(['next']);
    expect(select(rows, { issued: '2027-03-03' })).toEqual([]);
  });

  it('select the invoices whose service period starts on a UTC day', () => {
    const rows = [
      invoiceRow('feb', 'A', { serviceFrom: '2027-02-01T00:00:00.000Z' }),
      invoiceRow('mar', 'A', { serviceFrom: '2027-03-01T00:00:00.000Z' }),
    ];

    expect(select(rows, { servicePeriod: '2027-03-01' })).toEqual(['mar']);
  });
});

describe('the fields of the handoff queue', () => {
  const queue = createHandoffFilterFields(t);

  it('keep to what tells one waiting invoice from another', () => {
    expect(queue.map((field) => field.id)).toEqual([
      'query',
      'status',
      'kind',
      'overdue',
    ]);
  });

  it('search the number an invoice was booked under as well', () => {
    const rows = [
      queuedRow('inv-1', 'Initech', {
        handoff: { claimCount: 0, externalReference: 'ERP-4411', status: 'ACKNOWLEDGED' },
      }),
      queuedRow('inv-2', 'Globex'),
    ];

    expect(select(rows, { query: 'erp-44' }, queue)).toEqual(['inv-1']);
  });
});
