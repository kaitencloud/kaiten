import { describe, it, expect } from 'vite-plus/test';
import { generateSlug } from '..';

const API_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

describe('generateSlug', () => {
  describe('basic functionality', () => {
    it('should convert simple string to lowercase', () => {
      expect(generateSlug('TestFeature')).toBe('testfeature');
    });

    it('should handle string with spaces', () => {
      expect(generateSlug('Test Feature Flag')).toBe('test-feature-flag');
    });

    it('should trim leading and trailing spaces', () => {
      expect(generateSlug('  Test Feature  ')).toBe('test-feature');
    });

    it('should handle empty string', () => {
      expect(generateSlug('')).toBe('');
    });

    it('should handle string with only spaces', () => {
      expect(generateSlug('   ')).toBe('');
    });
  });

  describe('special characters', () => {
    it('should turn symbols into separators', () => {
      expect(generateSlug('Test@Feature#Flag')).toBe('test-feature-flag');
    });

    it('should turn underscores into hyphens, which the API requires', () => {
      expect(generateSlug('test_feature_flag')).toBe('test-feature-flag');
    });

    it('should keep hyphens', () => {
      expect(generateSlug('test-feature-flag')).toBe('test-feature-flag');
    });

    it('should handle punctuation', () => {
      expect(generateSlug('Test! Feature? Flag.')).toBe('test-feature-flag');
    });

    it('should handle parentheses and brackets', () => {
      expect(generateSlug('Test (Feature) [Flag]')).toBe('test-feature-flag');
    });

    it('should turn slashes into separators', () => {
      expect(generateSlug('Test/Feature\\Flag')).toBe('test-feature-flag');
    });

    it('should turn unicode symbols into separators', () => {
      expect(generateSlug('Test™Feature®Flag')).toBe('test-feature-flag');
    });

    it('should drop apostrophes instead of splitting the word', () => {
      expect(generateSlug("L'Oréal")).toBe('loreal');
      expect(generateSlug('Kevin’s Shop')).toBe('kevins-shop');
    });

    it('should handle string with only special characters', () => {
      expect(generateSlug('!@#$%^&*()')).toBe('');
    });
  });

  describe('hyphens normalization', () => {
    it('should replace multiple spaces with single hyphen', () => {
      expect(generateSlug('Test    Feature    Flag')).toBe('test-feature-flag');
    });

    it('should deduplicate consecutive hyphens', () => {
      expect(generateSlug('test---feature---flag')).toBe('test-feature-flag');
    });

    it('should remove leading hyphens', () => {
      expect(generateSlug('---test-feature')).toBe('test-feature');
    });

    it('should remove trailing hyphens', () => {
      expect(generateSlug('test-feature---')).toBe('test-feature');
    });

    it('should remove both leading and trailing hyphens', () => {
      expect(generateSlug('---test-feature---')).toBe('test-feature');
    });

    it('should handle mixed spaces and hyphens', () => {
      expect(generateSlug('test - - - feature')).toBe('test-feature');
    });
  });

  describe('accents and diacritics', () => {
    it('should transliterate common accented characters', () => {
      expect(generateSlug('Café Feature')).toBe('cafe-feature');
      expect(generateSlug('Café Test & Co')).toBe('cafe-test-co');
    });

    it('should transliterate german umlauts', () => {
      expect(generateSlug('Über Feature')).toBe('uber-feature');
    });

    it('should transliterate french accents', () => {
      expect(generateSlug('Feature Élégante')).toBe('feature-elegante');
      expect(generateSlug('Société Générale')).toBe('societe-generale');
    });

    it('should spell out letters that have no accent to drop', () => {
      expect(generateSlug('Œuvre Straße Øresund')).toBe('oeuvre-strasse-oresund');
    });

    it('should return an empty string when no character maps to a-z or 0-9', () => {
      expect(generateSlug('株式会社')).toBe('');
    });
  });

  describe('numbers', () => {
    it('should preserve numbers', () => {
      expect(generateSlug('Feature 123')).toBe('feature-123');
    });

    it('should handle numeric strings', () => {
      expect(generateSlug('2024')).toBe('2024');
    });

    it('should handle mixed alphanumeric', () => {
      expect(generateSlug('Test123Feature456')).toBe('test123feature456');
    });

    it('should turn version dots into hyphens so versions stay distinct', () => {
      expect(generateSlug('v0.1.0')).toBe('v0-1-0');
      expect(generateSlug('v0.10')).toBe('v0-10');
    });
  });

  describe('complex real-world examples', () => {
    it('should handle typical feature flag name', () => {
      expect(generateSlug('Enable Dark Mode')).toBe('enable-dark-mode');
    });

    it('should handle feature flag with version', () => {
      expect(generateSlug('Feature v2.0 Rollout')).toBe('feature-v2-0-rollout');
    });

    it('should handle feature flag with numbers and special chars', () => {
      expect(generateSlug('Beta Test #123 (Phase 2)')).toBe('beta-test-123-phase-2');
    });

    it('should handle very long feature flag name', () => {
      const longName = 'This Is A Very Long Feature Flag Name That Should Be Converted To A Slug';
      expect(generateSlug(longName)).toBe('this-is-a-very-long-feature-flag-name-that-should-be-converted-to-a-slug');
    });

    it('should handle camelCase name', () => {
      expect(generateSlug('enableNewUserOnboarding')).toBe('enablenewuseronboarding');
    });

    it('should convert snake_case name to kebab-case', () => {
      expect(generateSlug('enable_new_user_onboarding')).toBe('enable-new-user-onboarding');
    });

    it('should handle kebab-case name', () => {
      expect(generateSlug('enable-new-user-onboarding')).toBe('enable-new-user-onboarding');
    });

    it('should produce slugs the API accepts', () => {
      const names = ['Café Test & Co', 'v0.1.0', '__init__', '  Ünïcödé — Test  ', "L'Oréal (FR)"];

      for (const name of names) {
        expect(generateSlug(name)).toMatch(API_SLUG_PATTERN);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle string with tabs', () => {
      expect(generateSlug('Test\tFeature\tFlag')).toBe('test-feature-flag');
    });

    it('should handle string with newlines', () => {
      expect(generateSlug('Test\nFeature\nFlag')).toBe('test-feature-flag');
    });

    it('should handle string with mixed whitespace', () => {
      expect(generateSlug('Test  \t\n  Feature')).toBe('test-feature');
    });

    it('should handle single character', () => {
      expect(generateSlug('A')).toBe('a');
    });

    it('should handle single special character', () => {
      expect(generateSlug('@')).toBe('');
    });

    it('should handle string starting with number', () => {
      expect(generateSlug('123 Test')).toBe('123-test');
    });
  });
});
