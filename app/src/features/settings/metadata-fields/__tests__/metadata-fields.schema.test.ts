import { describe, expect, it } from 'vite-plus/test';
import type { MetadataSettingsField } from '../types';
import {
  computeMetadataFieldFormWarnings,
  createMetadataFieldFormValues,
  getNativeMetadataKeys,
  getReorderedActiveFieldIds,
  getVisibleMetadataFields,
  hasJsonSchemaChanged,
  hasStructuralJsonSchemaChanged,
  isNativeMetadataKey,
  metadataFieldFormValuesFromField,
  metadataFieldFormValuesToJsonSchema,
  metadataPrimaryTypeToJsonSchema,
  parseEnumOptions,
  validateMetadataFieldForm,
} from '../schemas';

const baseField = (
  overrides: Partial<MetadataSettingsField>,
): MetadataSettingsField => ({
  displayOrder: 0,
  id: 'field-1',
  jsonSchema: { type: 'string' },
  key: 'tier',
  label: 'Tier',
  resourceType: 'DEPLOYMENT_ZONE',
  ...overrides,
});

describe('metadata field schema helpers', () => {
  it('maps primary UI types to JSON Schema', () => {
    expect(metadataPrimaryTypeToJsonSchema('STRING')).toEqual({
      type: 'string',
    });
    expect(metadataPrimaryTypeToJsonSchema('NUMBER')).toEqual({
      type: 'number',
    });
    expect(metadataPrimaryTypeToJsonSchema('BOOLEAN')).toEqual({
      type: 'boolean',
    });
    expect(metadataPrimaryTypeToJsonSchema('ENUM', 'gold\nsilver')).toEqual({
      enum: ['gold', 'silver'],
      type: 'string',
    });
    expect(
      metadataPrimaryTypeToJsonSchema('ENUM_LIST', 'gold\nsilver'),
    ).toEqual({
      items: { enum: ['gold', 'silver'], type: 'string' },
      type: 'array',
      uniqueItems: true,
    });
    expect(metadataPrimaryTypeToJsonSchema('DATE')).toEqual({
      format: 'date',
      type: 'string',
    });
  });

  it('pre-fills form values from existing JSON Schema', () => {
    expect(
      metadataFieldFormValuesFromField(
        baseField({
          jsonSchema: {
            description: 'Allowed regions',
            enum: ['ca', 'eu'],
            type: 'string',
          },
        }),
      ),
    ).toEqual({
      description: 'Allowed regions',
      enumOptionsText: 'ca\neu',
      key: 'tier',
      label: 'Tier',
      primaryType: 'ENUM',
    });

    expect(
      metadataFieldFormValuesFromField(
        baseField({
          jsonSchema: {
            items: { enum: ['a', 'b'], type: 'string' },
            type: 'array',
            uniqueItems: true,
          },
        }),
      ).primaryType,
    ).toBe('ENUM_LIST');
  });

  it('serializes form values back to JSON Schema with description', () => {
    expect(
      metadataFieldFormValuesToJsonSchema({
        description: 'A visible label for admins',
        enumOptionsText: '',
        key: 'notes',
        label: 'Notes',
        primaryType: 'STRING',
      }),
    ).toEqual({
      description: 'A visible label for admins',
      type: 'string',
    });
  });

  it('rejects native keys by resource type', () => {
    expect(isNativeMetadataKey('name', 'DEPLOYMENT_ZONE')).toBe(true);
    expect(isNativeMetadataKey('releaseId', 'DEPLOYMENT_ZONE')).toBe(true);
    expect(isNativeMetadataKey('customerId', 'DEPLOYMENT_ZONE')).toBe(false);
    expect(isNativeMetadataKey('customerId', 'INSTANCE')).toBe(true);
    expect(isNativeMetadataKey('platform', 'INSTANCE')).toBe(true);
  });

  // Pin the native key list so adding a column on the
  // backend without updating the frontend guard is loud. If the snapshot
  // changes, check that the corresponding Go DTO actually grew a column
  // (and add the same key here); otherwise this is dead code drift.
  it('pins native keys for each resource type', () => {
    expect(getNativeMetadataKeys('DEPLOYMENT_ZONE').sort()).toEqual(
      [
        'createdAt',
        'createdBy',
        'description',
        'id',
        'metadata',
        'name',
        'releaseId',
        'slug',
        'type',
        'updatedAt',
        'updatedBy',
      ].sort(),
    );
    expect(getNativeMetadataKeys('INSTANCE').sort()).toEqual(
      [
        'createdAt',
        'createdBy',
        'customerId',
        'customerSlug',
        'deploymentZoneId',
        'description',
        'endLicenseDate',
        'id',
        'licenseId',
        'licenseSlug',
        'metadata',
        'name',
        'platform',
        'slug',
        'startLicenseDate',
        'updatedAt',
        'updatedBy',
      ].sort(),
    );
  });

  // Split on newlines only. Commas are kept verbatim so
  // values like `"Acme, Inc."` survive a round-trip through the textarea.
  it('parses enum options newline-only, preserving commas inside values', () => {
    expect(parseEnumOptions('gold\nsilver, bronze\nplatinum')).toEqual([
      'gold',
      'silver, bronze',
      'platinum',
    ]);
    // Trimming + dedup are still applied.
    expect(parseEnumOptions('  prod  \n\n  prod \nstaging')).toEqual([
      'prod',
      'staging',
    ]);
  });

  it('shows archived fields only when requested', () => {
    const activeField = baseField({ id: 'active', label: 'Active' });
    const archivedField = baseField({
      archivedAt: '2026-01-01T00:00:00Z',
      displayOrder: 1,
      id: 'archived',
      label: 'Archived',
    });

    expect(
      getVisibleMetadataFields([activeField, archivedField], false),
    ).toEqual([activeField]);
    expect(
      getVisibleMetadataFields([activeField, archivedField], true),
    ).toEqual([activeField, archivedField]);
  });

  it('returns active IDs in the requested reordered order', () => {
    const first = baseField({ displayOrder: 0, id: 'first' });
    const second = baseField({ displayOrder: 1, id: 'second' });
    const third = baseField({ displayOrder: 2, id: 'third' });

    expect(
      getReorderedActiveFieldIds([first, second, third], 'first', 'third'),
    ).toEqual(['second', 'third', 'first']);
  });

  // Pure-description edits should not trigger the
  // (potentially expensive) dry-run path. `hasJsonSchemaChanged` stays
  // strict; `hasStructuralJsonSchemaChanged` ignores cosmetic keys.
  it('distinguishes cosmetic edits from structural ones', () => {
    const field = baseField({ jsonSchema: { type: 'string' } });

    expect(
      hasJsonSchemaChanged(field, { type: 'string', description: 'new' }),
    ).toBe(true);
    expect(
      hasStructuralJsonSchemaChanged(field, {
        type: 'string',
        description: 'new',
        examples: ['hello'],
      }),
    ).toBe(false);

    // A real shape change is still flagged.
    expect(
      hasStructuralJsonSchemaChanged(field, {
        type: 'string',
        enum: ['a', 'b'],
      }),
    ).toBe(true);
  });

  // Reusing an archived field's key is allowed by the
  // backend's partial unique index (it only covers non-archived rows) but
  // we surface a soft warning so the admin doesn't ship it by accident.
  it('warns when reusing an archived field key', () => {
    const archivedField = baseField({
      archivedAt: '2026-01-01T00:00:00Z',
      id: 'archived',
      key: 'region',
    });
    const activeOther = baseField({ id: 'active', key: 'tier' });
    const values = {
      ...createMetadataFieldFormValues(),
      key: 'region',
      label: 'Region',
    };

    expect(
      computeMetadataFieldFormWarnings(values, {
        fields: [archivedField, activeOther],
      }),
    ).toEqual({
      key: expect.stringContaining('archived field already used this key'),
    });

    // Editing the archived field itself does not warn.
    expect(
      computeMetadataFieldFormWarnings(values, {
        editingFieldId: 'archived',
        fields: [archivedField, activeOther],
      }),
    ).toEqual({});

    // No collision → no warning.
    expect(
      computeMetadataFieldFormWarnings(
        { ...values, key: 'brand-new' },
        { fields: [archivedField, activeOther] },
      ),
    ).toEqual({});
  });

  it('blocks duplicate keys against *active* fields only', () => {
    const archivedField = baseField({
      archivedAt: '2026-01-01T00:00:00Z',
      id: 'archived',
      key: 'region',
    });
    const activeField = baseField({ id: 'active', key: 'tier' });

    // Reusing an active key is an error.
    expect(
      validateMetadataFieldForm(
        {
          ...createMetadataFieldFormValues(),
          key: 'tier',
          label: 'Tier',
        },
        { fields: [activeField], resourceType: 'DEPLOYMENT_ZONE' },
      ).key,
    ).toBe('An active metadata field already uses this key.');

    // Reusing an archived key passes (the warning system handles it).
    expect(
      validateMetadataFieldForm(
        {
          ...createMetadataFieldFormValues(),
          key: 'region',
          label: 'Region',
        },
        { fields: [archivedField], resourceType: 'DEPLOYMENT_ZONE' },
      ),
    ).toEqual({});
  });

  it('rejects malformed keys (spaces, leading digit, symbols)', () => {
    const expectInvalid = (key: string) =>
      expect(
        validateMetadataFieldForm(
          { ...createMetadataFieldFormValues(), key, label: 'Region' },
          { fields: [], resourceType: 'DEPLOYMENT_ZONE' },
        ).key,
      ).toBe(
        'Use letters, numbers and underscores only (no spaces), starting with a letter.',
      );

    expectInvalid('hosting Region');
    expectInvalid('1region');
    expectInvalid('region-code');
    expectInvalid('région');

    // camelCase and snake_case identifiers stay valid.
    expect(
      validateMetadataFieldForm(
        {
          ...createMetadataFieldFormValues(),
          key: 'hostingRegion',
          label: 'Hosting region',
        },
        { fields: [], resourceType: 'DEPLOYMENT_ZONE' },
      ).key,
    ).toBeUndefined();
    expect(
      validateMetadataFieldForm(
        {
          ...createMetadataFieldFormValues(),
          key: 'seed_profile',
          label: 'Seed profile',
        },
        { fields: [], resourceType: 'INSTANCE' },
      ).key,
    ).toBeUndefined();
  });
});
