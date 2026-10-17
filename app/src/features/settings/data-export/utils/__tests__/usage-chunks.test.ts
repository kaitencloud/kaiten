import { describe, expect, it } from 'vite-plus/test';
import { getUsageChunks, usageChunkFilename } from '../usage-chunks';

describe('the months of the usage export', () => {
  const now = new Date('2027-03-15T10:30:00.000Z');

  it('lists the month it is and the ones before, newest first', () => {
    const chunks = getUsageChunks(3, now);

    expect(chunks.map((chunk) => chunk.key)).toEqual([
      '2027-03',
      '2027-02',
      '2027-01',
      '2026-12',
    ]);
  });

  it('reads each month from its first instant up to the next one, in UTC', () => {
    const [march, february] = getUsageChunks(1, now);

    expect(march).toEqual({
      from: '2027-03-01T00:00:00.000Z',
      key: '2027-03',
      to: '2027-04-01T00:00:00.000Z',
    });
    expect(february).toEqual({
      from: '2027-02-01T00:00:00.000Z',
      key: '2027-02',
      to: '2027-03-01T00:00:00.000Z',
    });
  });

  it('never reads more than the 31 days an export takes', () => {
    for (const chunk of getUsageChunks(40, now)) {
      const days = (Date.parse(chunk.to) - Date.parse(chunk.from)) / 86_400_000;

      expect(days, chunk.key).toBeLessThanOrEqual(31);
      expect(days, chunk.key).toBeGreaterThanOrEqual(28);
    }
  });

  it('crosses a year, and a leap February', () => {
    const chunks = getUsageChunks(14, new Date('2028-03-01T00:00:00.000Z'));

    expect(chunks.at(-1)?.key).toBe('2027-01');
    expect(chunks.find((chunk) => chunk.key === '2028-02')).toMatchObject({
      from: '2028-02-01T00:00:00.000Z',
      to: '2028-03-01T00:00:00.000Z',
    });
  });

  it('counts in UTC whatever the zone of the machine', () => {
    // 23:30 on the last day of the month is already the next month in Auckland.
    expect(
      getUsageChunks(0, new Date('2027-03-31T23:30:00.000Z'))[0].key,
    ).toBe('2027-03');
  });

  it('is only the current month for no months before', () => {
    expect(getUsageChunks(0, now)).toHaveLength(1);
  });
});

describe('the name of the file of a month', () => {
  it('says the month and the UTC moment of the download, so that two exports never overwrite each other', () => {
    expect(
      usageChunkFilename(
        { key: '2027-03' },
        new Date('2027-04-01T09:00:05.000Z'),
      ),
    ).toBe('usage-2027-03-20270401T090005Z.csv');
  });
});
