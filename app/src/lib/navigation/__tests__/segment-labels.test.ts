import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  getSectionForPath,
  getSegmentLabel,
  humanizeSegment,
} from '../segment-labels';

const translations: Record<string, string> = {
  'Pages.Addons.Compatibility.title': 'Licences compatibles',
  'Pages.Addons.title': 'Options',
  'Pages.Billing.Handoff.title': 'Transmission',
  'Pages.Billing.Invoices.Lines.title': 'Lignes',
  'Pages.Billing.Invoices.title': 'Factures',
  'Pages.Billing.title': 'Facturation',
  'Pages.Customers.Instances.Detail.Billing.Subscribe.title': 'Souscrire',
  'Pages.Customers.title': 'Clients',
  'Pages.FeatureFlags.title': 'Feature Flags',
  'Pages.Integrations.PublishableKeys.title': 'Clés publiables',
  'Pages.Licenses.Prices.title': 'Prix',
  'Pages.Vouchers.title': 'Codes promo',
};

const t = ((key: string, options?: { defaultValue?: string }) =>
  translations[key] ?? options?.defaultValue ?? key) as unknown as TFunction;

describe('segment labels', () => {
  it('gives a known segment the label the app already uses for it', () => {
    expect(getSegmentLabel('feature-flags', t)).toBe('Feature Flags');
    expect(getSegmentLabel('customers', t)).toBe('Clients');
  });

  it('labels the segments of the billing screens', () => {
    expect(
      Object.fromEntries(
        [
          'billing',
          'invoices',
          'lines',
          'handoff',
          'addons',
          'compatibility',
          'vouchers',
          'prices',
          'subscribe',
          'publishable-keys',
        ].map((segment) => [segment, getSegmentLabel(segment, t)]),
      ),
    ).toEqual({
      addons: 'Options',
      billing: 'Facturation',
      compatibility: 'Licences compatibles',
      handoff: 'Transmission',
      invoices: 'Factures',
      lines: 'Lignes',
      prices: 'Prix',
      'publishable-keys': 'Clés publiables',
      subscribe: 'Souscrire',
      vouchers: 'Codes promo',
    });
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
    // The invoices, the add-ons and the vouchers sit beside /billing, not under
    // it: each is a section.
    expect(getSectionForPath('/invoices/inv-1', t)).toEqual({
      href: '/invoices',
      label: 'Factures',
    });
    expect(getSectionForPath('/billing/handoff', t)).toEqual({
      href: '/billing',
      label: 'Facturation',
    });
    expect(getSectionForPath('/addons/seats-v1', t)).toEqual({
      href: '/addons',
      label: 'Options',
    });
    expect(getSectionForPath('/vouchers/new', t)).toEqual({
      href: '/vouchers',
      label: 'Codes promo',
    });
    expect(getSectionForPath('/unknown/page', t)).toBeUndefined();
    expect(getSectionForPath('/', t)).toBeUndefined();
  });
});
