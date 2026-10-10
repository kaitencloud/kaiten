import { describe, expect, it } from 'vite-plus/test';
import {
  getCommercialFieldsToCopy,
  getPricingType,
  getTrialPeriodDays,
  isHttpUrl,
} from '../license-commercial.utils';

describe('how a version is sold', () => {
  it('reads a pricing type the response left out as the API creates one: custom', () => {
    expect(getPricingType({})).toBe('CUSTOM');
    expect(getPricingType({ pricingType: 'FREE' })).toBe('FREE');
  });

  it('reads a trial of 0, which the API sends for none, as none', () => {
    expect(getTrialPeriodDays({})).toBeUndefined();
    expect(getTrialPeriodDays({ trialPeriodDays: 0 })).toBeUndefined();
    expect(getTrialPeriodDays({ trialPeriodDays: 14 })).toBe(14);
  });
});

describe('the call-to-action URL of a version', () => {
  it('is a link only when it is an http or https address with no whitespace, as the API takes it', () => {
    expect(isHttpUrl('https://acme.test/contact')).toBe(true);
    expect(isHttpUrl('http://acme.test')).toBe(true);
    expect(isHttpUrl('ftp://acme.test')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('//acme.test')).toBe(false);
    expect(isHttpUrl('https://acme.test/a b')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('the terms a new version starts with', () => {
  it('are those of the version it starts from, as far as they are set', () => {
    expect(
      getCommercialFieldsToCopy({
        pricingType: 'PAID',
        requiresPaymentMethod: true,
        selfServeCtaUrl: 'https://acme.test/contact',
        trialPeriodDays: 14,
      }),
    ).toEqual({
      pricingType: 'PAID',
      requiresPaymentMethod: true,
      selfServeCtaUrl: 'https://acme.test/contact',
      trialPeriodDays: 14,
    });
  });

  it('are nothing for a version sold on request with nothing set, which is what the API creates', () => {
    expect(
      getCommercialFieldsToCopy({
        pricingType: 'CUSTOM',
        requiresPaymentMethod: false,
      }),
    ).toEqual({});
    expect(getCommercialFieldsToCopy({})).toEqual({});
  });

  it('send no trial for a version that has none: a trial is at least a day on create', () => {
    const copied = getCommercialFieldsToCopy({
      pricingType: 'FREE',
      trialPeriodDays: 0,
    });

    expect(copied).toEqual({ pricingType: 'FREE' });
    expect(copied).not.toHaveProperty('trialPeriodDays');
  });
});
