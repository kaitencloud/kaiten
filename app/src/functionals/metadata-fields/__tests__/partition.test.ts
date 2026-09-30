import { describe, expect, it } from 'vite-plus/test';
import { partitionFields, partitionMetadata } from '../partition';
import type { MetadataFieldDescriptor } from '../types';

const f = (
  key: string,
  archived?: string,
): MetadataFieldDescriptor => ({
  id: `id-${key}`,
  key,
  label: key,
  jsonSchema: { type: 'string' },
  displayOrder: 0,
  archivedAt: archived,
});

describe('partitionFields', () => {
  it('splits by archivedAt and preserves order', () => {
    const { active, archived } = partitionFields([
      f('region'),
      f('tier', '2026-01-01T00:00:00Z'),
      f('cluster'),
      f('legacy', '2026-01-01T00:00:00Z'),
    ]);
    expect(active.map((x) => x.key)).toEqual(['region', 'cluster']);
    expect(archived.map((x) => x.key)).toEqual(['tier', 'legacy']);
  });

  it('returns empty subsets for an empty input', () => {
    expect(partitionFields([])).toEqual({ active: [], archived: [] });
  });
});

describe('partitionMetadata', () => {
  const fields = [
    f('region'),
    f('tier'),
    f('legacy_a', '2026-01-01T00:00:00Z'),
    f('legacy_b', '2026-01-01T00:00:00Z'),
  ];

  it('buckets known-active / archived-leftover / unknown', () => {
    const result = partitionMetadata(
      {
        region: 'eu',
        tier: 'gold',
        legacy_a: 'kept-from-history',
        // legacy_b is intentionally absent — no leftover.
        random: 42,
      },
      fields,
    );
    expect(result.knownActive).toEqual({ region: 'eu', tier: 'gold' });
    expect(result.archivedLeftovers).toEqual({ legacy_a: 'kept-from-history' });
    expect(result.unknown).toEqual({ random: 42 });
  });

  it('returns three empty objects for nil / empty metadata', () => {
    const empty = { knownActive: {}, archivedLeftovers: {}, unknown: {} };
    expect(partitionMetadata(null, fields)).toEqual(empty);
    expect(partitionMetadata(undefined, fields)).toEqual(empty);
    expect(partitionMetadata({}, fields)).toEqual(empty);
  });

  it('treats every key as unknown when no fields are declared', () => {
    const result = partitionMetadata({ a: 1, b: 2 }, []);
    expect(result.knownActive).toEqual({});
    expect(result.archivedLeftovers).toEqual({});
    expect(result.unknown).toEqual({ a: 1, b: 2 });
  });
});
