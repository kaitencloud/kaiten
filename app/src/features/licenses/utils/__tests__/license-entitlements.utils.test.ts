import { describe, expect, it } from 'vite-plus/test';
import type { Entitlement, LicenseEntitlement } from '@/api-client';
import {
  formatEntitlementOveragePercent,
  formatEntitlementThreshold,
  getEntitlementSlug,
  isNumericEntitlementType,
  parseOveragePercentInput,
  parseThresholdInput,
  resolveLicenseEntitlements,
  toEditableEntitlementType,
} from '../license-entitlements.utils';

const entitlementCatalog = [
  {
    aggregationMethod: 'COUNT',
    description: null,
    id: 'ent-api',
    name: 'API Calls',
    type: 'NUMBER',
  },
  {
    aggregationMethod: 'COUNT',
    description: null,
    id: 'ent-sso',
    name: 'SSO Integration',
    type: 'BOOLEAN',
  },
] as Entitlement[];

describe('license-entitlements utils', () => {
  describe('parseThresholdInput', () => {
    it('returns unlimited for empty or "Unlimited"', () => {
      expect(parseThresholdInput('')).toBe(-1);
      expect(parseThresholdInput('   ')).toBe(-1);
      expect(parseThresholdInput('Unlimited')).toBe(-1);
      expect(parseThresholdInput('unlimited')).toBe(-1);
    });

    it('parses integer values', () => {
      expect(parseThresholdInput('0')).toBe(0);
      expect(parseThresholdInput('42')).toBe(42);
      expect(parseThresholdInput('-1')).toBe(-1);
    });

    it('returns null for invalid values', () => {
      expect(parseThresholdInput('3.14')).toBeNull();
      expect(parseThresholdInput('-2')).toBeNull();
      expect(parseThresholdInput('abc')).toBeNull();
    });
  });

  describe('formatEntitlementThreshold', () => {
    it('formats boolean entitlements', () => {
      expect(
        formatEntitlementThreshold({
          enabled: true,
          entitlementId: 'ent-sso',
          entitlementName: 'SSO Integration',
          entitlementType: 'BOOLEAN',
          limitCapExceededOveragePercent: null,
          threshold: null,
        }),
      ).toBe('Enabled');

      expect(
        formatEntitlementThreshold({
          enabled: false,
          entitlementId: 'ent-sso',
          entitlementName: 'SSO Integration',
          entitlementType: 'BOOLEAN',
          limitCapExceededOveragePercent: null,
          threshold: null,
        }),
      ).toBe('Disabled');
    });

    it('formats config entitlements', () => {
      expect(
        formatEntitlementThreshold({
          enabled: null,
          entitlementId: 'ent-config',
          entitlementName: 'Config Feature',
          entitlementType: 'CONFIG',
          limitCapExceededOveragePercent: null,
          threshold: null,
        }),
      ).toBe('Configured');
    });

    it('formats number thresholds including unlimited', () => {
      expect(
        formatEntitlementThreshold({
          enabled: null,
          entitlementId: 'ent-api',
          entitlementName: 'API Calls',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 0,
          threshold: 10000,
        }),
      ).toBe((10000).toLocaleString());

      expect(
        formatEntitlementThreshold({
          enabled: null,
          entitlementId: 'ent-api',
          entitlementName: 'API Calls',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: -1,
          threshold: -1,
        }),
      ).toBe('Unlimited');
    });
  });

  describe('resolveLicenseEntitlements', () => {
    it('resolves entitlementId from entitlementName when missing in payload', () => {
      const licenseEntitlements = [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          createdBy: { id: 'user-1', name: 'User 1' },
          entitlementName: 'SSO Integration',
          entitlementSlug: 'sso-integration',
          entitlementType: 'BOOLEAN',
          licenseId: 'lic-1',
          licenseSlug: 'license-1',
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: { id: 'user-1', name: 'User 1' },
          value: { type: 'boolean', value: true },
        },
      ] as LicenseEntitlement[];

      const result = resolveLicenseEntitlements(
        licenseEntitlements,
        entitlementCatalog,
      );

      expect(result).toEqual([
        {
          enabled: true,
          entitlementIcon: null,
          entitlementId: 'ent-sso',
          entitlementName: 'SSO Integration',
          entitlementType: 'BOOLEAN',
          limitCapExceededOveragePercent: null,
          threshold: null,
        },
      ]);
    });

    it('resolves NUMBER entitlement threshold from value field', () => {
      const licenseEntitlements = [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          createdBy: { id: 'user-1', name: 'User 1' },
          entitlementName: 'API Calls',
          entitlementSlug: 'api-calls',
          entitlementType: 'NUMBER',
          licenseId: 'lic-1',
          licenseSlug: 'license-1',
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: { id: 'user-1', name: 'User 1' },
          value: { type: 'number', value: 5000 },
        },
      ] as LicenseEntitlement[];

      const result = resolveLicenseEntitlements(
        licenseEntitlements,
        entitlementCatalog,
      );

      expect(result).toEqual([
        {
          enabled: null,
          entitlementIcon: null,
          entitlementId: 'ent-api',
          entitlementName: 'API Calls',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 0,
          threshold: 5000,
        },
      ]);
    });

    it('keeps the overage percent of a NUMBER grant and normalises it against the threshold', () => {
      const base = {
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: { id: 'user-1', name: 'User 1' },
        entitlementName: 'API Calls',
        entitlementSlug: 'api-calls',
        entitlementType: 'NUMBER',
        licenseId: 'lic-1',
        licenseSlug: 'license-1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: { id: 'user-1', name: 'User 1' },
      };
      const licenseEntitlements = [
        {
          ...base,
          limitCapExceededOveragePercent: 25,
          value: { type: 'number', value: 5000 },
        },
        {
          ...base,
          limitCapExceededOveragePercent: 25,
          value: { type: 'number', value: -1 },
        },
      ] as LicenseEntitlement[];

      const result = resolveLicenseEntitlements(
        licenseEntitlements,
        entitlementCatalog,
      );

      expect(result.map((row) => row.limitCapExceededOveragePercent)).toEqual([
        25, -1,
      ]);
    });

    it('treats an AI credit grant as a numeric grant with its own overage percent', () => {
      const licenseEntitlements = [
        {
          createdAt: '2026-01-01T00:00:00.000Z',
          createdBy: { id: 'user-1', name: 'User 1' },
          entitlementName: 'AI Credits',
          entitlementSlug: 'ai-credits',
          entitlementType: 'NUMBER_AI_CREDIT',
          licenseId: 'lic-1',
          licenseSlug: 'license-1',
          limitCapExceededOveragePercent: 10,
          updatedAt: '2026-01-01T00:00:00.000Z',
          updatedBy: { id: 'user-1', name: 'User 1' },
          value: { type: 'number', value: 500 },
        },
      ] as unknown as LicenseEntitlement[];

      const result = resolveLicenseEntitlements(licenseEntitlements, [
        ...entitlementCatalog,
        {
          aggregationMethod: 'SUM',
          description: null,
          id: 'ent-ai',
          name: 'AI Credits',
          type: 'NUMBER_AI_CREDIT',
        } as Entitlement,
      ]);

      expect(result).toEqual([
        {
          enabled: null,
          entitlementIcon: null,
          entitlementId: 'ent-ai',
          entitlementName: 'AI Credits',
          entitlementType: 'NUMBER',
          limitCapExceededOveragePercent: 10,
          threshold: 500,
        },
      ]);
    });
  });

  describe('entitlement type helpers', () => {
    it('recognises the NUMBER family', () => {
      expect(isNumericEntitlementType('NUMBER')).toBe(true);
      expect(isNumericEntitlementType('NUMBER_AI_CREDIT')).toBe(true);
      expect(isNumericEntitlementType('BOOLEAN')).toBe(false);
      expect(isNumericEntitlementType('CONFIG')).toBe(false);
      expect(isNumericEntitlementType(undefined)).toBe(false);
    });

    it('folds catalogue types into the editable kinds', () => {
      expect(toEditableEntitlementType('NUMBER')).toBe('NUMBER');
      expect(toEditableEntitlementType('NUMBER_AI_CREDIT')).toBe('NUMBER');
      expect(toEditableEntitlementType('CONFIG')).toBe('CONFIG');
      expect(toEditableEntitlementType('BOOLEAN')).toBe('BOOLEAN');
      expect(toEditableEntitlementType(null)).toBe('BOOLEAN');
    });
  });

  describe('parseOveragePercentInput', () => {
    it('treats an empty input as a hard limit', () => {
      expect(parseOveragePercentInput('')).toBe(0);
      expect(parseOveragePercentInput('   ')).toBe(0);
    });

    it('parses whole percentages with or without a percent sign', () => {
      expect(parseOveragePercentInput('0')).toBe(0);
      expect(parseOveragePercentInput('10')).toBe(10);
      expect(parseOveragePercentInput('10%')).toBe(10);
      expect(parseOveragePercentInput(' 10 % ')).toBe(10);
    });

    it('rejects negative, fractional or non-numeric input', () => {
      expect(parseOveragePercentInput('-1')).toBeNull();
      expect(parseOveragePercentInput('2.5')).toBeNull();
      expect(parseOveragePercentInput('abc')).toBeNull();
    });
  });

  describe('formatEntitlementOveragePercent', () => {
    const numberRow = {
      enabled: null,
      entitlementId: 'ent-api',
      entitlementName: 'API Calls',
      entitlementType: 'NUMBER' as const,
    };

    it('labels hard and soft limits', () => {
      expect(
        formatEntitlementOveragePercent({
          ...numberRow,
          limitCapExceededOveragePercent: 0,
          threshold: 100,
        }),
      ).toBe('Hard limit');
      expect(
        formatEntitlementOveragePercent({
          ...numberRow,
          limitCapExceededOveragePercent: 10,
          threshold: 100,
        }),
      ).toBe('+10% overage');
    });

    it('passes the percent to the translator', () => {
      const translate = (key: string, options?: Record<string, unknown>) =>
        `${key}:${String(options?.percent ?? '')}`;

      expect(
        formatEntitlementOveragePercent(
          {
            ...numberRow,
            limitCapExceededOveragePercent: 10,
            threshold: 100,
          },
          translate,
        ),
      ).toBe('Pages.Licenses.Entitlements.Status.softLimit:10');
    });

    it('shows a dash for unlimited or non-numeric grants', () => {
      expect(
        formatEntitlementOveragePercent({
          ...numberRow,
          limitCapExceededOveragePercent: -1,
          threshold: -1,
        }),
      ).toBe('-');
      expect(
        formatEntitlementOveragePercent({
          enabled: true,
          entitlementId: 'ent-sso',
          entitlementName: 'SSO Integration',
          entitlementType: 'BOOLEAN',
          limitCapExceededOveragePercent: null,
          threshold: null,
        }),
      ).toBe('-');
    });
  });

  describe('getEntitlementSlug', () => {
    it('uses API slug when present', () => {
      const entitlement = {
        ...entitlementCatalog[0],
        slug: 'api-calls',
      } as Entitlement;

      expect(getEntitlementSlug(entitlement)).toBe('api-calls');
    });

    it('falls back to slugified name when slug is missing', () => {
      expect(getEntitlementSlug(entitlementCatalog[1])).toBe(
        'sso-integration',
      );
    });
  });
});
