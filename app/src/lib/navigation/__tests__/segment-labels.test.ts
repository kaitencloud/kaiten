import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  getSectionForPath,
  getSegmentLabel,
  humanizeSegment,
} from '../segment-labels';

const translations: Record<string, string> = {
  'Pages.Customers.title': 'Clients',
  'Pages.FeatureFlags.title': 'Feature Flags',
};

const t = ((key: string, options?: { defaultValue?: string }) =>
  translations[key] ?? options?.defaultValue ?? key) as unknown as TFunction;

describe('segment labels', () => {
  it('gives a known segment the label the app already uses for it', () => {
    expect(getSegmentLabel('feature-flags', t)).toBe('Feature Flags');
    expect(getSegmentLabel('customers', t)).toBe('Clients');
  });

  it('reads a segment as words when it has no translation', () => {
    expect(getSegmentLabel('deployment-zones', t)).toBe('Deployment Zones');
    expect(getSegmentLabel('audit-trail', t)).toBe('Audit Trail');
    expect(humanizeSegment('service-accounts')).toBe('Service Accounts');
  });

  it('finds the side-nav section a path lies under', () => {
    expect(getSectionForPath('/customers/acme/edit', t)).toEqual({
      href: '/customers',
      label: 'Clients',
    });
    expect(getSectionForPath('/audit-trail/unknown', t)).toEqual({
      href: '/audit-trail',
      label: 'Audit Trail',
    });
    expect(getSectionForPath('/unknown/page', t)).toBeUndefined();
    expect(getSectionForPath('/', t)).toBeUndefined();
  });
});
