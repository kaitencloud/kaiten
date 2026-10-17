import { describe, expect, it } from 'vite-plus/test';
import { FILTER_MULTI_SELECT_SEPARATOR } from '@/functionals/filters';
import {
  getAppliedFilters,
  toInvoiceExportSelection,
} from '../invoice-export-filters';

const together = (values: string[]) => values.join(FILTER_MULTI_SELECT_SEPARATOR);

describe('what an export is asked for', () => {
  it('is the scope of the page and nothing else when no filter is set', () => {
    expect(toInvoiceExportSelection({}, [])).toEqual({ filters: {}, unapplied: [] });
    expect(
      toInvoiceExportSelection({ customerSlug: 'acme', instanceSlug: 'acme-prod' }, []),
    ).toEqual({
      filters: { customerSlug: 'acme', instanceSlug: 'acme-prod' },
      unapplied: [],
    });
  });

  it('carries every filter the API takes the same way, whatever the case a value was typed in', () => {
    expect(
      toInvoiceExportSelection({ customerSlug: 'acme' }, [
        { id: 'status', value: together(['paid', 'MANUAL']) },
        { id: 'kind', value: 'renewal' },
        { id: 'handoff', value: 'PENDING' },
        { id: 'provider', value: 'Stripe' },
        { id: 'held', value: 'true' },
      ]),
    ).toEqual({
      filters: {
        customerSlug: 'acme',
        handoffStatus: 'PENDING',
        held: true,
        kind: 'RENEWAL',
        providerKind: 'STRIPE',
        status: ['PAID', 'MANUAL'],
      },
      unapplied: [],
    });
  });

  it('leaves overdue out, since the API counts it more widely than the screen does', () => {
    // The API counts an invoice overdue past its due date whatever collects it and
    // whether its payment failed; the screen only one that SEND_INVOICE collects. The
    // file would hold invoices the screen does not show, so it is named instead.
    expect(
      toInvoiceExportSelection({ customerSlug: 'acme' }, [
        { id: 'overdue', value: 'true' },
        { id: 'kind', value: 'RENEWAL' },
      ]),
    ).toEqual({
      filters: { customerSlug: 'acme', kind: 'RENEWAL' },
      unapplied: ['overdue'],
    });
  });

  it('turns a day of the issue into the period that starts with it and ends where the next day starts', () => {
    expect(
      toInvoiceExportSelection({}, [{ id: 'issued', value: '2027-03-31' }]),
    ).toEqual({
      filters: {
        issuedFrom: '2027-03-31T00:00:00.000Z',
        issuedTo: '2027-04-01T00:00:00.000Z',
      },
      unapplied: [],
    });
  });

  it('names what the API has no filter for, so that the menu says the file leaves it out', () => {
    expect(
      toInvoiceExportSelection({ instanceSlug: 'acme-prod' }, [
        { id: 'query', value: 'acme' },
        { id: 'servicePeriod', value: '2027-03-01' },
        { id: 'kind', value: 'FINAL' },
      ]),
    ).toEqual({
      filters: { instanceSlug: 'acme-prod', kind: 'FINAL' },
      unapplied: ['query', 'servicePeriod'],
    });
  });

  it('leaves out a filter that excludes, since the API takes only "yes" for these', () => {
    expect(
      toInvoiceExportSelection({}, [{ id: 'held', value: 'false' }]),
    ).toEqual({ filters: {}, unapplied: ['held'] });
  });

  it('leaves out a value it does not know, rather than send what the API would refuse', () => {
    expect(
      toInvoiceExportSelection({}, [
        { id: 'status', value: together(['NOT_A_STATUS']) },
        { id: 'kind', value: 'NOT_A_KIND' },
        { id: 'issued', value: 'yesterday' },
      ]),
    ).toEqual({ filters: {}, unapplied: ['status', 'kind', 'issued'] });
  });
});

describe('the filters of the screen that have a value', () => {
  const normal = {
    activeFilterIds: ['kind', 'held'],
    pinnedFilterIds: ['query'],
    quickAccessFilterIds: ['status'],
    values: { held: '', kind: 'RENEWAL', query: '  acme ', status: '', ignored: 'x' },
  };

  it('are the pinned, the quick-access and the picked ones, in that order, with what they hold trimmed', () => {
    expect(getAppliedFilters(normal)).toEqual([
      { id: 'query', value: 'acme' },
      { id: 'kind', value: 'RENEWAL' },
    ]);
  });

  it('are none when nothing was typed or picked', () => {
    expect(
      getAppliedFilters({ ...normal, activeFilterIds: [], values: {} }),
    ).toEqual([]);
  });
});
