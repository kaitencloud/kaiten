import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import { getInvoiceFilterChips } from '../invoice-filter-chips';
import { getInvoiceTitle } from '../invoice-title';

// The keys with their values, so that a chip reads as it would on screen.
const t = ((key: string, options?: Record<string, string>) => {
  const table: Record<string, string> = {
    'Features.Billing.HandoffStatus.PENDING': 'Waiting for your ERP',
    'Features.Billing.InvoiceKind.RENEWAL': 'Renewal',
    'Features.Billing.InvoiceStatus.MANUAL': 'Ready to bill',
    'Features.Billing.InvoiceStatus.PAID': 'Paid',
    'Features.Billing.ProviderKind.NOOP': 'Manual',
    'Pages.Billing.Invoices.Filters.boundary': 'Boundary',
    'Pages.Billing.Invoices.Filters.customer': 'Customer',
    'Pages.Billing.Invoices.Filters.handoff': 'Handoff',
    'Pages.Billing.Invoices.Filters.held': 'Held',
    'Pages.Billing.Invoices.Filters.instance': 'Instance',
    'Pages.Billing.Invoices.Filters.issued': 'Issued',
    'Pages.Billing.Invoices.Filters.kind': 'Kind',
    'Pages.Billing.Invoices.Filters.openEnd': 'any',
    'Pages.Billing.Invoices.Filters.overdue': 'Overdue',
    'Pages.Billing.Invoices.Filters.provider': 'Provider',
    'Pages.Billing.Invoices.Filters.status': 'Status',
  };
  if (key === 'Pages.Billing.Invoices.Filters.chip') {
    return `${options?.field}: ${options?.value}`;
  }
  if (key === 'Pages.Billing.Invoices.Detail.title') {
    return `${options?.kind} invoice, ${options?.date}`;
  }

  return table[key] ?? key;
}) as unknown as TFunction;

describe('the chips of the filters that are set', () => {
  it('has none for no filter', () => {
    expect(getInvoiceFilterChips({}, t, 'en')).toEqual([]);
  });

  it('says each filter in words, with the field it is on', () => {
    const chips = getInvoiceFilterChips(
      {
        customerSlug: 'initech',
        handoffStatus: 'PENDING',
        held: true,
        kind: 'RENEWAL',
        overdue: true,
        providerKind: 'NOOP',
        status: ['PAID', 'MANUAL'],
      },
      t,
      'en',
    );

    expect(chips.map((chip) => chip.label)).toEqual([
      'Status: Paid, Ready to bill',
      'Kind: Renewal',
      'Provider: Manual',
      'Handoff: Waiting for your ERP',
      'Overdue',
      'Held',
      'Customer: initech',
    ]);
  });

  it('writes a period with the day it starts and the day it ends, open at an end that is not set', () => {
    const [boundary, issued] = getInvoiceFilterChips(
      {
        boundaryFrom: '2027-03-01T00:00:00.000Z',
        boundaryTo: '2027-04-01T00:00:00.000Z',
        issuedTo: '2027-04-01T00:00:00.000Z',
      },
      t,
      'en',
    );

    expect(boundary.label).toBe(
      'Boundary: Mar 1, 2027 (UTC) → Apr 1, 2027 (UTC)',
    );
    expect(issued.label).toBe('Issued: any → Apr 1, 2027 (UTC)');
  });

  it('takes off the filter it names and no other: both ends of a period go together', () => {
    const chips = getInvoiceFilterChips(
      {
        boundaryFrom: '2027-03-01T00:00:00.000Z',
        boundaryTo: '2027-04-01T00:00:00.000Z',
        instanceSlug: 'initech-production',
        status: ['PAID'],
      },
      t,
      'en',
    );

    expect(chips.map((chip) => chip.id)).toEqual([
      'status',
      'instanceSlug',
      'boundary',
    ]);
    expect(chips[0].clear).toEqual({ status: undefined });
    expect(chips[1].clear).toEqual({ instanceSlug: undefined });
    expect(chips[2].clear).toEqual({
      boundaryFrom: undefined,
      boundaryTo: undefined,
    });
  });
});

describe('the title of an invoice', () => {
  it('is its kind and the boundary it bills: the id is a key, not a name', () => {
    expect(
      getInvoiceTitle(
        { boundaryAt: '2027-04-01T00:00:00.000Z', kind: 'RENEWAL' },
        t,
        'en',
      ),
    ).toBe('Renewal invoice, Apr 1, 2027 (UTC)');
  });
});
