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
  'Pages.Billing.Invoices.Lines.title': 'Lignes',
  'Pages.Billing.Invoices.title': 'Factures',
  'Pages.Billing.title': 'Facturation',
  'Pages.Catalog.title': 'Catalogue',
  'Pages.Customers.Instances.Detail.Billing.Subscribe.title': 'Souscrire',
  'Pages.Customers.title': 'Clients',
  'Pages.FeatureFlags.title': 'Feature Flags',
  'Pages.Integrations.PublishableKeys.title': 'Clés publiables',
  'Pages.Licenses.Prices.title': 'Prix',
  'Pages.Licenses.title': 'Licences',
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
          'catalog',
          'invoices',
          'lines',
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
      catalog: 'Catalogue',
      compatibility: 'Licences compatibles',
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
    // The invoices are a section of their own.
    expect(getSectionForPath('/invoices/inv-1', t)).toEqual({
      href: '/invoices',
      label: 'Factures',
    });
    // The catalog is one, and each of its entries is too: the way back from a
    // missing add-on is the add-ons, not the catalog.
    expect(getSectionForPath('/catalog/unknown', t)).toEqual({
      href: '/catalog',
      label: 'Catalogue',
    });
    expect(getSectionForPath('/catalog/licenses/pro-v2', t)).toEqual({
      href: '/catalog/licenses',
      label: 'Licences',
    });
    expect(getSectionForPath('/catalog/addons/seats-v1', t)).toEqual({
      href: '/catalog/addons',
      label: 'Options',
    });
    expect(getSectionForPath('/catalog/vouchers/new', t)).toEqual({
      href: '/catalog/vouchers',
      label: 'Codes promo',
    });
    // The routes the catalog replaced are no section.
    expect(getSectionForPath('/licenses/pro-v2', t)).toBeUndefined();
    expect(getSectionForPath('/unknown/page', t)).toBeUndefined();
    expect(getSectionForPath('/', t)).toBeUndefined();
  });
});
