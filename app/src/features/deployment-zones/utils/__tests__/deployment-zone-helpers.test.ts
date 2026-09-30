import { describe, expect, it } from 'vite-plus/test';
import {
  formatDate,
  formatZoneType,
  getZoneTypeBadgeVariant,
} from '../deployment-zone-helpers';

describe('deployment-zone-helpers', () => {
  describe('getZoneTypeBadgeVariant', () => {
    it('should return the accent for production', () => {
      expect(getZoneTypeBadgeVariant('production')).toBe('default');
    });

    it('should return secondary for staging', () => {
      expect(getZoneTypeBadgeVariant('staging')).toBe('secondary');
    });

    it('should return outline for development', () => {
      expect(getZoneTypeBadgeVariant('development')).toBe('outline');
    });

    it('should return outline for unknown types', () => {
      expect(getZoneTypeBadgeVariant('unknown')).toBe('outline');
      expect(getZoneTypeBadgeVariant('test')).toBe('outline');
      expect(getZoneTypeBadgeVariant('')).toBe('outline');
    });
  });

  describe('formatZoneType', () => {
    const mockT = (key: string) => {
      const translations: Record<string, string> = {
        'Features.Releases.Types.production': 'Production',
        'Features.Releases.Types.staging': 'Staging',
        'Features.Releases.Types.development': 'Development',
      };
      return translations[key] || key;
    };

    it('should return translated zone type', () => {
      expect(formatZoneType('production', mockT)).toBe('Production');
      expect(formatZoneType('staging', mockT)).toBe('Staging');
      expect(formatZoneType('development', mockT)).toBe('Development');
    });

    // The type is free-form: one the console has no label for reads as it
    // was typed, never as a translation key that does not exist.
    it('should show a type without a label as it was typed', () => {
      expect(formatZoneType('dedicated', mockT)).toBe('dedicated');
      expect(formatZoneType('constructor', mockT)).toBe('constructor');
    });
  });

  describe('formatDate', () => {
    it('should format ISO date string correctly', () => {
      const result = formatDate('2024-01-25T10:00:00Z');
      expect(result).toMatch(/Jan.*2024/);
    });

    it('should format different dates correctly', () => {
      const result = formatDate('2023-12-15T12:00:00Z');
      expect(result).toMatch(/Dec.*2023/);
    });

    it('should handle timestamp at start of day', () => {
      const result = formatDate('2024-06-15T00:00:00Z');
      expect(result).toMatch(/2024/);
    });
  });
});
