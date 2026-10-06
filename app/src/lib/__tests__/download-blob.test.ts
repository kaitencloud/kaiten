import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { downloadBlob, filenameFromResponse, saveBlob } from '../download-blob';

const respond = (headers: Record<string, string> = {}) =>
  new Response(null, { headers });

describe('filenameFromResponse', () => {
  it.each([
    ['attachment; filename="invoices-2027-03.csv"', 'invoices-2027-03.csv'],
    ['attachment; filename=invoices.csv', 'invoices.csv'],
    ["attachment; filename*=UTF-8''factures%20mars.csv", 'factures mars.csv'],
    [
      'attachment; filename="fallback.csv"; filename*=UTF-8\'\'encod%C3%A9.csv',
      'encodé.csv',
    ],
  ])('reads %s', (header, expected) => {
    expect(filenameFromResponse(respond({ 'Content-Disposition': header }))).toBe(
      expected,
    );
  });

  it('proposes nothing when the response names no file', () => {
    expect(filenameFromResponse(respond())).toBeUndefined();
    expect(filenameFromResponse(undefined)).toBeUndefined();
  });
});

describe('saving a file', () => {
  const click = vi.fn();
  let revoke: ReturnType<typeof vi.fn>;
  let anchor: HTMLAnchorElement | undefined;

  beforeEach(() => {
    click.mockClear();
    revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:invoices');
    URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
    anchor = undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchor = this;
      click();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveBlob', () => {
    it('hands the blob to the browser under the name it was given, and cleans up', async () => {
      const blob = new Blob(['id,total\n']);

      saveBlob(blob, 'audit-trail-2027-03-01.csv');

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      expect(anchor?.download).toBe('audit-trail-2027-03-01.csv');
      expect(anchor?.href).toBe('blob:invoices');
      expect(anchor?.rel).toBe('noopener');
      // Not left in the page, and its URL released once the click is handled.
      expect(document.querySelector('a[download]')).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:invoices'));
    });

    it('releases the URL even when the click throws', async () => {
      click.mockImplementationOnce(() => {
        throw new Error('blocked');
      });

      expect(() => saveBlob(new Blob(['x']), 'a.csv')).toThrow('blocked');
      expect(document.querySelector('a[download]')).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:invoices'));
    });
  });

  describe('downloadBlob', () => {
    it('saves the body of the request as a file, under the name it proposes', async () => {
      const blob = new Blob(['id,total\n']);

      await downloadBlob(
        async () => ({
          data: blob,
          response: respond({ 'Content-Disposition': 'attachment; filename="invoices.csv"' }),
        }),
        'fallback.csv',
      );

      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledTimes(1);
      expect(anchor?.download).toBe('invoices.csv');
    });

    it('falls back to the name it was given', async () => {
      await downloadBlob(async () => ({ data: new Blob(['x']) }), 'invoices.csv');

      expect(anchor?.download).toBe('invoices.csv');
    });

    it('lets a failure of the request through, and saves nothing', async () => {
      const failure = new Error('refused');

      await expect(
        downloadBlob(async () => {
          throw failure;
        }, 'invoices.csv'),
      ).rejects.toBe(failure);
      expect(click).not.toHaveBeenCalled();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
  });
});
