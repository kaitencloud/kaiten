import { describe, expect, it } from 'vite-plus/test';
import { formatFileStamp } from '../file-stamp';

describe('formatFileStamp', () => {
  it('writes the UTC moment of a download without separators, padded', () => {
    expect(formatFileStamp(new Date('2027-03-04T05:06:07.890Z'))).toBe(
      '20270304T050607Z',
    );
  });

  it('reads the moment in UTC, whatever the zone of the machine', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      expect(formatFileStamp(new Date('2027-12-31T23:59:59.000Z'))).toBe(
        '20271231T235959Z',
      );
    } finally {
      if (original === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = original;
      }
    }
  });
});
