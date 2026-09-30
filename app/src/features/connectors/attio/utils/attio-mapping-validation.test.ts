import { describe, expect, it } from 'vite-plus/test';
import type { EditableMappingRow } from '../types';
import { validateAttioMappings } from './attio-mapping-validation';

const row = (
  id: string,
  sourceField: string | null,
  attioSlug: string | null,
): EditableMappingRow => ({ id, sourceField, attioSlug });

describe('validateAttioMappings', () => {
  it('accepts empty rows and valid mappings', () => {
    const result = validateAttioMappings([
      row('empty', null, null),
      row('valid', 'customer.id', 'kaiten_customer_id'),
    ]);

    expect(result.isValid).toBe(true);
  });

  it('rejects incomplete and malformed mappings', () => {
    const result = validateAttioMappings([
      row('incomplete', 'customer.id', null),
      row('invalid', 'instance.slug', 'Not Valid'),
    ]);

    expect(result.issuesByRowId.get('incomplete')).toContain('incomplete');
    expect(result.issuesByRowId.get('invalid')).toContain('invalid-slug');
    expect(result.isValid).toBe(false);
  });

  it('rejects duplicate sources and targets on the same Attio object', () => {
    const result = validateAttioMappings([
      row('first', 'customer.id', 'external_id'),
      row('same-source', 'customer.id', 'other_id'),
      row('same-target', 'customer.name', 'external_id'),
    ]);

    expect(result.issuesByRowId.get('first')).toEqual(
      expect.arrayContaining(['duplicate-source', 'duplicate-target']),
    );
    expect(result.issuesByRowId.get('same-source')).toContain(
      'duplicate-source',
    );
    expect(result.issuesByRowId.get('same-target')).toContain(
      'duplicate-target',
    );
  });

  it('allows the same slug on different Attio objects', () => {
    const result = validateAttioMappings([
      row('company', 'customer.id', 'external_id'),
      row('workspace', 'instance.slug', 'external_id'),
    ]);

    expect(result.isValid).toBe(true);
  });

  it('protects default Attio target slugs', () => {
    const result = validateAttioMappings([
      row('default-collision', 'customer.id', 'name'),
    ]);

    expect(result.issuesByRowId.get('default-collision')).toContain(
      'duplicate-target',
    );
  });
});
