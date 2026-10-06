import { describe, expect, it } from 'vite-plus/test';
import type { BillingCapabilities } from '@/api-client';
import { ApiError } from '@/lib/errors';
import { billingCapabilitiesProfiles } from '../../../../e2e/app/_support/model/billing-capabilities';
import {
  hasBillingFeature,
  resolveBillingAvailability,
  toBillingGate,
} from '../logic';

const problem = (status: number, code: string | undefined, detail: string) =>
  new ApiError({ status, data: { code, detail, status, title: 'Error' } });

const enabled = (features: Partial<BillingCapabilities['features']> = {}) => {
  const capabilities = billingCapabilitiesProfiles.stack();
  return { ...capabilities, features: { ...capabilities.features, ...features } };
};

describe('resolveBillingAvailability', () => {
  it('is available when the capabilities say billing is enabled', () => {
    const capabilities = billingCapabilitiesProfiles.stack();

    expect(resolveBillingAvailability(capabilities, null)).toEqual({
      available: true,
      capabilities,
    });
  });

  it.each([
    ['DEPLOYMENT_DISABLED', 'DEPLOYMENT_DISABLED'],
    ['NOT_ENTITLED', 'NOT_ENTITLED'],
  ] as const)('keeps the reason a disabled deployment gives: %s', (disabledReason, reason) => {
    expect(
      resolveBillingAvailability(
        billingCapabilitiesProfiles.disabled(disabledReason),
        null,
      ),
    ).toEqual({ available: false, reason });
  });

  it('reads a disabled answer with no reason as a disabled deployment', () => {
    const { disabledReason: _omitted, ...capabilities } =
      billingCapabilitiesProfiles.disabled();

    expect(resolveBillingAvailability(capabilities, null)).toEqual({
      available: false,
      reason: 'DEPLOYMENT_DISABLED',
    });
  });

  it('names the scope a 403 asks for, and hides billing', () => {
    expect(
      resolveBillingAvailability(
        undefined,
        problem(403, 'Auth.MissingScope', 'missing required scope: read:billing'),
      ),
    ).toEqual({ available: false, reason: 'MISSING_SCOPE', scope: 'read:billing' });
  });

  it('falls back to the scope reading the capabilities needs', () => {
    expect(
      resolveBillingAvailability(
        undefined,
        problem(403, 'Auth.MissingScope', 'forbidden'),
      ),
    ).toEqual({ available: false, reason: 'MISSING_SCOPE', scope: 'read:billing' });
  });

  it('reads billing refusals of its own as billing being off', () => {
    expect(
      resolveBillingAvailability(
        undefined,
        problem(403, 'Billing.NotEntitled', 'plan'),
      ),
    ).toEqual({ available: false, reason: 'NOT_ENTITLED' });
    expect(
      resolveBillingAvailability(
        undefined,
        problem(403, 'Billing.Disabled', 'off'),
      ),
    ).toEqual({ available: false, reason: 'DEPLOYMENT_DISABLED' });
  });

  it('reads a 404 as an API older than billing', () => {
    expect(
      resolveBillingAvailability(undefined, problem(404, undefined, 'Not Found')),
    ).toEqual({ available: false, reason: 'FEATURE_UNAVAILABLE' });
  });

  it.each([
    ['a 503', problem(503, 'Billing.EntitlementCheckUnavailable', 'down')],
    ['a network failure', new ApiError({ data: new TypeError('Failed to fetch') })],
    ['a timeout', new Error('The billing capabilities timed out')],
    ['a 500', problem(500, undefined, 'boom')],
  ])('fails closed on %s, without an error', (_, error) => {
    expect(resolveBillingAvailability(undefined, error)).toEqual({
      available: false,
      reason: 'UNREACHABLE',
    });
  });
});

describe('hasBillingFeature and toBillingGate', () => {
  it('needs billing on, and the part shipped when one is asked for', () => {
    const shipped = resolveBillingAvailability(enabled({ addons: true }), null);
    const unshipped = resolveBillingAvailability(enabled(), null);
    const off = resolveBillingAvailability(
      billingCapabilitiesProfiles.disabled(),
      null,
    );

    expect(hasBillingFeature(shipped)).toBe(true);
    expect(hasBillingFeature(shipped, 'addons')).toBe(true);
    expect(hasBillingFeature(unshipped)).toBe(true);
    expect(hasBillingFeature(unshipped, 'addons')).toBe(false);
    expect(hasBillingFeature(off)).toBe(false);
    expect(hasBillingFeature(off, 'addons')).toBe(false);
  });

  it('opens the gate, or says why it is closed', () => {
    const unshipped = resolveBillingAvailability(enabled(), null);
    const off = resolveBillingAvailability(
      billingCapabilitiesProfiles.disabled('NOT_ENTITLED'),
      null,
    );

    expect(toBillingGate(unshipped)).toEqual({ available: true });
    expect(toBillingGate(unshipped, 'vouchers')).toEqual({
      available: false,
      reason: 'FEATURE_UNAVAILABLE',
    });
    expect(toBillingGate(off, 'vouchers')).toMatchObject({
      available: false,
      reason: 'NOT_ENTITLED',
    });
  });
});
