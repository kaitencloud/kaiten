import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { downloadAuditTrailCsv } from '../audit-trail-export';
import type { GlobalAuditEntry } from '../audit-trail.types';

const entry = {
  customerName: 'Acme',
  eventName: 'INSTANCE_CREATED',
  eventType: 'com.kaiten.instance.v1.created',
  id: '1',
  instanceName: 'Production',
  instanceSlug: 'production',
  payload: { a: 1 },
  timestamp: '2027-03-01T10:00:00Z',
} as GlobalAuditEntry;

describe('downloadAuditTrailCsv', () => {
  let anchor: HTMLAnchorElement | undefined;
  let saved: Blob | undefined;

  beforeEach(() => {
    anchor = undefined;
    saved = undefined;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      saved = blob as Blob;
      return 'blob:audit';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchor = this;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves the entries as a dated CSV file', async () => {
    downloadAuditTrailCsv([entry], (name) => name, '2027-03-01');

    expect(anchor?.download).toBe('audit-trail-2027-03-01.csv');
    expect(saved?.type).toBe('text/csv;charset=utf-8;');
    expect(await saved?.text()).toContain('INSTANCE_CREATED');
  });
});
