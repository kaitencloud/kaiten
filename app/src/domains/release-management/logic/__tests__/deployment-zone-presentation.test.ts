import { describe, expect, it } from 'vite-plus/test';
import {
  countsAsProduction,
  getZoneTypeSuggestions,
  isDefaultZoneType,
  sortZoneTypes,
} from '../deployment-zone-presentation';

describe('deployment-zone-presentation', () => {
  describe('countsAsProduction', () => {
    it('counts production and any type an organization named for its own', () => {
      expect(countsAsProduction('production')).toBe(true);
      expect(countsAsProduction('dedicated')).toBe(true);
      expect(countsAsProduction('shared')).toBe(true);
    });

    it('leaves out the two pre-production classes', () => {
      expect(countsAsProduction('staging')).toBe(false);
      expect(countsAsProduction('development')).toBe(false);
    });
  });

  describe('isDefaultZoneType', () => {
    it('knows only the three classes, in their exact spelling', () => {
      expect(isDefaultZoneType('staging')).toBe(true);
      expect(isDefaultZoneType('Staging')).toBe(false);
      expect(isDefaultZoneType('constructor')).toBe(false);
    });
  });

  describe('sortZoneTypes', () => {
    it('puts the three classes first in their own order, then the rest alphabetically, once each', () => {
      expect(
        sortZoneTypes([
          'shared',
          'development',
          'dedicated',
          'production',
          'shared',
        ]),
      ).toEqual(['production', 'development', 'dedicated', 'shared']);
    });
  });

  describe('getZoneTypeSuggestions', () => {
    it('offers the three classes even when the organization has no zone yet', () => {
      expect(getZoneTypeSuggestions([])).toEqual([
        'production',
        'staging',
        'development',
      ]);
    });

    it('adds the types the organization already uses', () => {
      expect(getZoneTypeSuggestions(['shared', 'dedicated', 'shared'])).toEqual(
        ['production', 'staging', 'development', 'dedicated', 'shared'],
      );
    });
  });
});
